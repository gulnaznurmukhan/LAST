package kz.clientflow.ai;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Google Gemini settings ("app.ai.*"). The API key lives only on the server
 * (environment variable GEMINI_API_KEY) and is never sent to the browser.
 * An empty key turns every AI feature off.
 */
@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(String apiKey, String model, String baseUrl, Duration timeout) {

    public boolean enabled() {
        return apiKey != null && !apiKey.isBlank();
    }
}
