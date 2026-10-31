package kz.clientflow.ai;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import kz.clientflow.ai.AiDtos.ChatMessage;
import kz.clientflow.ai.AiDtos.MessageRequest;
import kz.clientflow.ai.AiDtos.OrderDraft;
import kz.clientflow.ai.AiDtos.Purpose;
import kz.clientflow.ai.AiDtos.Tone;
import kz.clientflow.ai.GeminiClient.Turn;
import kz.clientflow.auth.RateLimiter;
import kz.clientflow.client.ClientService;
import kz.clientflow.client.dto.ClientDtos.ClientResponse;
import kz.clientflow.client.dto.ClientDtos.SortField;
import kz.clientflow.client.dto.ClientDtos.StatusFilter;
import kz.clientflow.common.ApiException;
import kz.clientflow.order.OrderService;
import kz.clientflow.order.OrderStatus;
import kz.clientflow.order.dto.OrderDtos;
import kz.clientflow.order.dto.OrderDtos.ArchiveFilter;
import kz.clientflow.order.dto.OrderDtos.OrderFilter;
import kz.clientflow.order.dto.OrderDtos.OrderResponse;
import kz.clientflow.report.ReportService;
import kz.clientflow.report.dto.ReportDtos.CurrencyAmount;
import kz.clientflow.report.dto.ReportDtos.DashboardResponse;
import kz.clientflow.workspace.WorkspaceAccess;
import kz.clientflow.workspace.WorkspaceService;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * AI assistant features on top of Google Gemini.
 *
 * The model only ever sees data the current user may see: the snapshot is built
 * with the same services as the regular API, so an EMPLOYEE's snapshot covers
 * only their assigned orders. Client e-mails and phone numbers are not sent.
 * Nothing the model returns is saved automatically.
 */
@Service
public class AiService {

    /** Per-user limit, shared by all AI endpoints. */
    private static final int LIMIT = 40;
    private static final Duration WINDOW = Duration.ofMinutes(10);
    private static final int SNAPSHOT_ORDERS = 60;
    private static final int SNAPSHOT_CLIENTS = 40;
    private static final int HISTORY_TURNS = 12;
    private static final Set<String> CURRENCIES = Set.of("KZT", "RUB", "USD", "EUR");
    private static final Map<String, String> LANGUAGES = Map.of("kk", "Kazakh", "ru", "Russian", "en", "English");

    private final GeminiClient gemini;
    private final RateLimiter rateLimiter;
    private final ReportService reports;
    private final OrderService orders;
    private final ClientService clients;
    private final WorkspaceService workspaces;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public AiService(GeminiClient gemini, RateLimiter rateLimiter, ReportService reports, OrderService orders,
                     ClientService clients, WorkspaceService workspaces, JsonMapper jsonMapper, Clock clock) {
        this.gemini = gemini;
        this.rateLimiter = rateLimiter;
        this.reports = reports;
        this.orders = orders;
        this.clients = clients;
        this.workspaces = workspaces;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    public boolean enabled() {
        return gemini.enabled();
    }

    // ------------------------------------------------------------------ assistant chat

    public String chat(WorkspaceAccess access, List<ChatMessage> messages, String language) {
        consume(access);
        String system = """
                You are the built-in business assistant of ClientFlow, a CRM for small businesses
                (clients, orders, payments). You help the owner and the team run the business.
                Answer in %s, briefly and to the point, like an experienced manager.
                Base every number, name and date on the DATA section only; if something is not
                in the data, say so instead of guessing. Never invent clients, orders or amounts.
                Never add up amounts in different currencies.
                Formatting: short paragraphs, "- " bullet lists, **bold** for key figures. No tables, no headings.
                When useful, end with one concrete next step.

                DATA (current state of the workspace):
                %s
                """.formatted(languageName(language), snapshot(access));

        List<ChatMessage> recent = messages.subList(Math.max(0, messages.size() - HISTORY_TURNS), messages.size());
        List<Turn> turns = new ArrayList<>();
        for (ChatMessage m : recent) {
            turns.add(new Turn("assistant".equals(m.role()) ? "model" : "user", m.text()));
        }
        // Gemini expects the conversation to start with the user
        while (!turns.isEmpty() && !"user".equals(turns.getFirst().role())) {
            turns.removeFirst();
        }
        if (turns.isEmpty()) {
            throw ApiException.badRequest("VALIDATION_FAILED");
        }
        return gemini.generate(system, turns, false);
    }

    /** A short daily briefing for the dashboard. */
    public String insights(WorkspaceAccess access, String language) {
        consume(access);
        String system = """
                You are the analyst of ClientFlow, a CRM for small businesses. Write in %s.
                Use only the DATA below. Never add up amounts in different currencies.

                DATA:
                %s
                """.formatted(languageName(language), snapshot(access));
        String task = """
                Write today's briefing for the business owner: 4 or 5 bullet points ("- "), one line each,
                most important first. Cover: what is overdue or due in the next days, who owes money
                and how much, how this month's payments look against previous months, and one
                concrete recommendation. Put key numbers and names in **bold**. No introduction, no closing.
                If there is almost no data, give 3 practical tips on how to start using the CRM instead.
                """;
        return gemini.generate(system, List.of(new Turn("user", task)), false);
    }

    // ------------------------------------------------------------------ message to a client

    public String composeMessage(WorkspaceAccess access, MessageRequest request) {
        consume(access);
        ClientResponse client = clients.get(access, request.clientId()).client();
        OrderResponse order = request.orderId() == null ? null : orders.get(access, request.orderId());
        if (order != null && !order.client().id().equals(client.id())) {
            throw ApiException.notFound();
        }
        String sender = workspaces.get(access).name();

        StringBuilder facts = new StringBuilder();
        facts.append("Client name: ").append(client.name()).append('\n');
        if (client.company() != null) {
            facts.append("Client company: ").append(client.company()).append('\n');
        }
        if (order != null) {
            facts.append("Order: ").append(order.orderNumber()).append(" — ").append(order.title()).append('\n')
                    .append("Status: ").append(order.status()).append('\n')
                    .append("Total: ").append(money(order.totalAmount(), order.currency())).append('\n')
                    .append("Paid: ").append(money(order.paidAmount(), order.currency())).append('\n')
                    .append("Balance due: ").append(money(order.balance(), order.currency())).append('\n');
            if (order.deadline() != null) {
                facts.append("Deadline: ").append(order.deadline())
                        .append(order.overdue() ? " (overdue)" : "").append('\n');
            }
        }
        facts.append("Today: ").append(LocalDate.now(clock)).append('\n');

        Tone tone = request.tone() == null ? Tone.FRIENDLY : request.tone();
        String system = """
                You write WhatsApp messages from a small business to its client. Write in %s.
                Tone: %s. Address the client by first name. 2 to 5 short sentences, natural and human,
                no clichés, at most one emoji. Plain text only: no markdown, no placeholders like [name],
                no subject line. Use only the facts given; format money like "45 000 ₸".
                Sign off with the business name: %s.
                """.formatted(languageName(request.language()), tone.name().toLowerCase(Locale.ROOT), sender);
        String task = "Purpose: " + purposeText(request.purpose()) + "\n\nFACTS:\n" + facts
                + (blank(request.instructions()) ? "" : "\nExtra wishes of the sender: " + request.instructions().trim());
        return gemini.generate(system, List.of(new Turn("user", task)), false);
    }

    // ------------------------------------------------------------------ order from a message

    public OrderDraft parseOrder(WorkspaceAccess access, String text, String language) {
        consume(access);
        LocalDate today = LocalDate.now(clock);
        String system = """
                You extract an order from a customer's message to a small business (often a WhatsApp chat).
                Today is %s, %s. Resolve relative dates ("tomorrow", "by Friday", "завтра", "ертең") to yyyy-MM-dd.
                Reply with one JSON object and nothing else:
                {"title": string, "description": string, "totalAmount": string|null, "currency": "KZT"|"RUB"|"USD"|"EUR"|null,
                 "deadline": "yyyy-MM-dd"|null, "clientName": string|null, "clientPhone": string|null}
                - title: short name of the order (max 80 characters), in %s
                - description: the details the business needs to do the job (quantities, sizes, address, wishes), in %s
                - totalAmount: only if a price is stated, digits with optional "." decimals; otherwise null
                - currency: KZT for tenge/тг/₸, null if no price
                - use null for anything not in the message; never invent values
                """.formatted(today, today.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                languageName(language), languageName(language));

        JsonNode json;
        try {
            json = jsonMapper.readTree(stripFences(gemini.generate(system, List.of(new Turn("user", text)), true)));
        } catch (JacksonException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_UNAVAILABLE");
        }

        String title = limit(textOf(json, "title"), 200);
        String description = limit(textOf(json, "description"), 5000);
        String amount = textOf(json, "totalAmount");
        if (amount != null) {
            amount = amount.replace(" ", "").replace(",", ".");
            if (!amount.matches("\\d{1,12}(\\.\\d{1,2})?") || new BigDecimal(amount).signum() <= 0) {
                amount = null;
            }
        }
        String currency = textOf(json, "currency");
        if (currency != null && !CURRENCIES.contains(currency.toUpperCase(Locale.ROOT))) {
            currency = null;
        }
        String deadline = textOf(json, "deadline");
        if (deadline != null) {
            try {
                if (LocalDate.parse(deadline).isBefore(today)) {
                    deadline = null;
                }
            } catch (DateTimeParseException e) {
                deadline = null;
            }
        }
        String clientName = limit(textOf(json, "clientName"), 200);
        String clientPhone = limit(textOf(json, "clientPhone"), 30);

        return new OrderDraft(title, description, amount, currency == null ? null : currency.toUpperCase(Locale.ROOT),
                deadline, clientName, clientPhone, matchClient(access, clientName, clientPhone));
    }

    /** An existing client with the same phone, or else exactly one client with that name. */
    private UUID matchClient(WorkspaceAccess access, String name, String phone) {
        if (phone != null && phone.replaceAll("[^0-9]", "").length() >= 6) {
            var byPhone = clients.findDuplicates(access, null, phone, null).stream().filter(c -> !c.archived()).toList();
            if (!byPhone.isEmpty()) {
                return byPhone.getFirst().id();
            }
        }
        if (name != null && name.length() >= 2) {
            var byName = clients.list(access, name, StatusFilter.ACTIVE, SortField.NAME, Sort.Direction.ASC, 0, 2).items();
            if (byName.size() == 1) {
                return byName.getFirst().id();
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ data snapshot

    /** Compact plain-text picture of the workspace, limited to what this member may see. */
    String snapshot(WorkspaceAccess access) {
        LocalDate today = LocalDate.now(clock);
        StringBuilder s = new StringBuilder();
        s.append("Business: ").append(workspaces.get(access).name()).append('\n');
        s.append("Today: ").append(today).append(" (")
                .append(today.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH)).append(")\n");
        s.append("Current user role: ").append(access.role()).append('\n');

        DashboardResponse d = reports.dashboard(access, today.withDayOfMonth(1), today);
        if (d.onlyAssignedOrders()) {
            s.append("Note: the user is an employee; order and payment data cover only orders assigned to them.\n");
        }
        s.append("Active clients: ").append(d.totalClients()).append('\n');
        s.append("Orders by status: ").append(d.ordersByStatus()).append('\n');
        s.append("Overdue orders: ").append(d.overdueOrders()).append('\n');
        s.append("Payments received this month: ").append(amounts(d.paymentsReceived())).append('\n');
        s.append("Outstanding balances (all active orders): ").append(amounts(d.outstandingBalances())).append('\n');

        var revenue = reports.revenue(access);
        revenue.series().forEach((currency, values) -> {
            s.append("Payments per month in ").append(currency).append(" (").append(revenue.months().getFirst())
                    .append(" .. ").append(revenue.months().getLast()).append("): ");
            for (BigDecimal v : values) {
                s.append(v.stripTrailingZeros().toPlainString()).append(' ');
            }
            s.append('\n');
        });

        var list = orders.list(access, new OrderFilter(null, ArchiveFilter.ACTIVE, null, null, null, null, null),
                0, SNAPSHOT_ORDERS, OrderDtos.SortField.DEADLINE, Sort.Direction.ASC);
        s.append("\nOrders (not archived, nearest deadline first; ").append(list.totalItems()).append(" in total):\n");
        for (OrderResponse o : list.items()) {
            s.append("- ").append(o.orderNumber()).append(" | ").append(o.title())
                    .append(" | client: ").append(o.client().name())
                    .append(" | ").append(o.status());
            if (o.deadline() != null) {
                s.append(" | deadline ").append(o.deadline());
                if (o.overdue()) {
                    s.append(" OVERDUE");
                }
            }
            s.append(" | total ").append(money(o.totalAmount(), o.currency()));
            if (o.status() != OrderStatus.CANCELLED) {
                s.append(" | paid ").append(money(o.paidAmount(), o.currency()))
                        .append(" | balance ").append(money(o.balance(), o.currency()));
            }
            if (o.assignedUser() != null) {
                s.append(" | assignee ").append(o.assignedUser().name());
            }
            s.append('\n');
        }

        var recentClients = clients.list(access, null, StatusFilter.ACTIVE, SortField.UPDATED_AT, Sort.Direction.DESC,
                0, SNAPSHOT_CLIENTS);
        s.append("\nRecently active clients (").append(recentClients.totalItems()).append(" in total): ");
        s.append(String.join(", ", recentClients.items().stream()
                .map(c -> c.company() == null ? c.name() : c.name() + " (" + c.company() + ")").toList()));
        s.append('\n');
        return s.toString();
    }

    // ------------------------------------------------------------------ helpers

    private void consume(WorkspaceAccess access) {
        if (!gemini.enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_DISABLED");
        }
        rateLimiter.consume("ai:user:" + access.userId(), LIMIT, WINDOW);
    }

    private static String purposeText(Purpose purpose) {
        return switch (purpose) {
            case GREETING -> "a warm first message: introduce the business and offer help";
            case ORDER_CONFIRMED -> "confirm that the order is accepted, mention what and when";
            case ORDER_READY -> "tell the client the order is ready and agree on pick-up or delivery";
            case PAYMENT_REMINDER -> "politely remind about the balance due; mention the amount and the deadline";
            case THANK_YOU -> "thank the client for the order and the payment, invite them back";
            case REVIEW_REQUEST -> "ask the client to leave a short review about the work";
            case CUSTOM -> "follow the sender's wishes";
        };
    }

    private static String languageName(String code) {
        return LANGUAGES.getOrDefault(code == null ? "ru" : code, "Russian");
    }

    private static String amounts(List<CurrencyAmount> items) {
        if (items.isEmpty()) {
            return "none";
        }
        return String.join(", ", items.stream()
                .map(a -> money(a.amount(), a.currency()) + " (" + a.count() + ")").toList());
    }

    private static String money(BigDecimal amount, String currency) {
        return amount.stripTrailingZeros().toPlainString() + " " + currency;
    }

    private static String textOf(JsonNode json, String field) {
        JsonNode node = json.path(field);
        if (node.isNull() || node.isMissingNode()) {
            return null;
        }
        String value = node.isNumber() ? node.numberValue().toString() : node.asString("").trim();
        return value.isEmpty() || "null".equalsIgnoreCase(value) ? null : value;
    }

    private static String limit(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    /** Some models wrap JSON in ```json fences even in JSON mode. */
    private static String stripFences(String text) {
        String t = text.trim();
        if (t.startsWith("```")) {
            t = t.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceFirst("\\s*```$", "");
        }
        return t;
    }
}
