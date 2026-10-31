package kz.clientflow.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import kz.clientflow.IntegrationTest;

/** AI endpoints with the Gemini call replaced: what the model sees and how its answer is checked. */
class AiTests extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Almaty"));

    @MockitoBean
    GeminiClient gemini;

    private TestUser owner;
    private UUID client;

    @BeforeEach
    void setUp() throws Exception {
        when(gemini.enabled()).thenReturn(true);
        owner = signUp("owner@example.com");
        client = createClient(owner, "Aigerim Bekova");
    }

    @Test
    void employeeAssistantOnlySeesAssignedOrders() throws Exception {
        TestUser employee = addMember(owner, "employee@example.com", "EMPLOYEE");
        createOrder(owner, client, null);                    // ORD-000001, not assigned
        createOrder(owner, client, employee.id());           // ORD-000002, assigned
        when(gemini.generate(anyString(), anyList(), anyBoolean())).thenReturn("ok");

        mockMvc.perform(post(ws(owner, "/ai/chat")).with(csrf()).cookie(employee.session())
                        .contentType("application/json")
                        .content(json("{'language':'ru','messages':[{'role':'user','text':'Какие у меня заказы?'}]}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("ok"));

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        verify(gemini).generate(system.capture(), anyList(), eq(false));
        assertThat(system.getValue())
                .contains("ORD-000002", "Russian", "employee")
                .doesNotContain("ORD-000001");
    }

    @Test
    void parsedOrderIsValidatedAndMatchedToClient() throws Exception {
        when(gemini.generate(anyString(), anyList(), eq(true))).thenReturn("""
                ```json
                {"title":"Торт на день рождения","description":"2 кг, шоколадный","totalAmount":"45 000",
                 "currency":"тенге","deadline":"%s","clientName":"Aigerim Bekova","clientPhone":null}
                ```""".formatted(TODAY.minusDays(3)));

        mockMvc.perform(post(ws(owner, "/ai/parse-order")).with(csrf()).cookie(owner.session())
                        .contentType("application/json")
                        .content(json("{'text':'Здравствуйте, нужен торт 2 кг','language':'ru'}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Торт на день рождения"))
                .andExpect(jsonPath("$.totalAmount").value("45000"))
                // not a supported currency code and a date in the past are dropped, not guessed
                .andExpect(jsonPath("$.currency").isEmpty())
                .andExpect(jsonPath("$.deadline").isEmpty())
                .andExpect(jsonPath("$.matchedClientId").value(client.toString()));
    }

    @Test
    void messageForAnotherClientsOrderIsNotFound() throws Exception {
        UUID other = createClient(owner, "Other Client");
        String order = createOrder(owner, other, null);

        mockMvc.perform(post(ws(owner, "/ai/message")).with(csrf()).cookie(owner.session())
                        .contentType("application/json")
                        .content(json("{'clientId':'%s','orderId':'%s','purpose':'ORDER_READY'}", client, idOf(order))))
                .andExpect(status().isNotFound());
    }

    @Test
    void nonMembersCannotUseTheAssistant() throws Exception {
        TestUser stranger = signUp("stranger@example.com");
        mockMvc.perform(post(ws(owner, "/ai/insights")).with(csrf()).cookie(stranger.session())
                        .contentType("application/json").content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void disabledWithoutApiKey() throws Exception {
        when(gemini.enabled()).thenReturn(false);
        mockMvc.perform(get("/api/v1/ai/status").cookie(owner.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));
        mockMvc.perform(post(ws(owner, "/ai/insights")).with(csrf()).cookie(owner.session())
                        .contentType("application/json").content("{}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AI_DISABLED"));
    }
}
