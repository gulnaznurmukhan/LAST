package kz.clientflow.ai;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AiDtos {

    private AiDtos() {
    }

    /** Interface / message language: kk, ru or en. */
    private static final String LANGUAGE = "kk|ru|en";

    public record StatusResponse(boolean enabled) {
    }

    public record ChatMessage(@NotNull @Pattern(regexp = "user|assistant") String role,
                              @NotBlank @Size(max = 4000) String text) {
    }

    public record ChatRequest(@NotNull @Size(min = 1, max = 20) List<@Valid ChatMessage> messages,
                              @Pattern(regexp = LANGUAGE) String language) {
    }

    public record InsightsRequest(@Pattern(regexp = LANGUAGE) String language) {
    }

    public record TextResponse(String text) {
    }

    /** What a WhatsApp / e-mail message to the client is about. */
    public enum Purpose {
        GREETING, ORDER_CONFIRMED, ORDER_READY, PAYMENT_REMINDER, THANK_YOU, REVIEW_REQUEST, CUSTOM
    }

    public enum Tone {
        FRIENDLY, NEUTRAL, FORMAL
    }

    public record MessageRequest(@NotNull UUID clientId,
                                 UUID orderId,
                                 @NotNull Purpose purpose,
                                 Tone tone,
                                 @Pattern(regexp = LANGUAGE) String language,
                                 @Size(max = 1000) String instructions) {
    }

    public record ParseOrderRequest(@NotBlank @Size(max = 5000) String text,
                                    @Pattern(regexp = LANGUAGE) String language) {
    }

    /**
     * Order draft read from a customer's message. Every field may be null: the user
     * checks and completes the form before anything is saved.
     */
    public record OrderDraft(String title, String description, String totalAmount, String currency,
                             String deadline, String clientName, String clientPhone, UUID matchedClientId) {
    }
}
