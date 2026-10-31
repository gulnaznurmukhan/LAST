package kz.clientflow.ai;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import kz.clientflow.common.ApiException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Thin client for the Gemini "generateContent" REST endpoint.
 * The key goes in the x-goog-api-key header, never in the URL, so it does not end up in logs.
 */
@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    /** One turn of a conversation: role is "user" or "model". */
    public record Turn(String role, String text) {
    }

    private final AiProperties properties;
    private final JsonMapper jsonMapper;
    private final HttpClient http;

    public GeminiClient(AiProperties properties, JsonMapper jsonMapper) {
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.http = HttpClient.newBuilder().connectTimeout(properties.timeout()).build();
    }

    public boolean enabled() {
        return properties.enabled();
    }

    /**
     * Sends the conversation and returns the model's text.
     *
     * @param json true asks the model for a JSON document instead of prose
     */
    public String generate(String systemPrompt, List<Turn> turns, boolean json) {
        if (!enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_DISABLED");
        }

        ObjectNode body = jsonMapper.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", systemPrompt);
        ArrayNode contents = body.putArray("contents");
        for (Turn turn : turns) {
            ObjectNode content = contents.addObject();
            content.put("role", turn.role());
            content.putArray("parts").addObject().put("text", turn.text());
        }
        ObjectNode config = body.putObject("generationConfig");
        config.put("temperature", json ? 0.1 : 0.6);
        config.put("maxOutputTokens", 2048);
        if (json) {
            config.put("responseMimeType", "application/json");
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(properties.baseUrl() + "/models/" + properties.model() + ":generateContent"))
                .timeout(properties.timeout())
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", properties.apiKey().trim())
                .POST(HttpRequest.BodyPublishers.ofString(jsonMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception e) {
            log.warn("Gemini request failed: {}", e.toString());
            throw unavailable();
        }

        if (response.statusCode() == 429) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "AI_BUSY");
        }
        if (response.statusCode() != 200) {
            // The body is Google's error message (model name, quota, ...): useful in logs, never sent to the user
            log.warn("Gemini returned HTTP {}: {}", response.statusCode(), abbreviate(response.body()));
            throw unavailable();
        }

        String text = extractText(jsonMapper.readTree(response.body()));
        if (text.isBlank()) {
            throw unavailable();
        }
        return text.trim();
    }

    /** Joins the answer parts, skipping the model's internal "thought" parts. */
    private static String extractText(JsonNode root) {
        StringBuilder text = new StringBuilder();
        for (JsonNode part : root.path("candidates").path(0).path("content").path("parts")) {
            if (!part.path("thought").asBoolean(false)) {
                text.append(part.path("text").asString(""));
            }
        }
        return text.toString();
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE");
    }

    private static String abbreviate(String body) {
        String oneLine = body == null ? "" : body.replaceAll("\\s+", " ");
        return oneLine.length() > 300 ? oneLine.substring(0, 300) + "…" : oneLine;
    }
}
