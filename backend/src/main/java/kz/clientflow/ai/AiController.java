package kz.clientflow.ai;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import kz.clientflow.ai.AiDtos.ChatRequest;
import kz.clientflow.ai.AiDtos.InsightsRequest;
import kz.clientflow.ai.AiDtos.MessageRequest;
import kz.clientflow.ai.AiDtos.OrderDraft;
import kz.clientflow.ai.AiDtos.ParseOrderRequest;
import kz.clientflow.ai.AiDtos.StatusResponse;
import kz.clientflow.ai.AiDtos.TextResponse;
import kz.clientflow.auth.CurrentUser;
import kz.clientflow.workspace.WorkspaceAccessService;

/** AI assistant (Gemini). Every member may use it; the data it sees follows the member's role. */
@RestController
public class AiController {

    private final AiService aiService;
    private final WorkspaceAccessService accessService;

    public AiController(AiService aiService, WorkspaceAccessService accessService) {
        this.aiService = aiService;
        this.accessService = accessService;
    }

    /** Lets the UI hide AI buttons when no API key is configured. */
    @GetMapping("/api/v1/ai/status")
    StatusResponse status() {
        return new StatusResponse(aiService.enabled());
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/ai/chat")
    TextResponse chat(@PathVariable UUID workspaceId, @AuthenticationPrincipal CurrentUser user,
                      @Valid @RequestBody ChatRequest body) {
        return new TextResponse(aiService.chat(accessService.requireMember(workspaceId, user.id()),
                body.messages(), body.language()));
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/ai/insights")
    TextResponse insights(@PathVariable UUID workspaceId, @AuthenticationPrincipal CurrentUser user,
                          @Valid @RequestBody InsightsRequest body) {
        return new TextResponse(aiService.insights(accessService.requireMember(workspaceId, user.id()),
                body.language()));
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/ai/message")
    TextResponse message(@PathVariable UUID workspaceId, @AuthenticationPrincipal CurrentUser user,
                         @Valid @RequestBody MessageRequest body) {
        return new TextResponse(aiService.composeMessage(accessService.requireMember(workspaceId, user.id()), body));
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/ai/parse-order")
    OrderDraft parseOrder(@PathVariable UUID workspaceId, @AuthenticationPrincipal CurrentUser user,
                          @Valid @RequestBody ParseOrderRequest body) {
        return aiService.parseOrder(accessService.requireMember(workspaceId, user.id()), body.text(), body.language());
    }
}
