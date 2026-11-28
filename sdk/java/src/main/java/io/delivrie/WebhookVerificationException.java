package io.delivrie;

/** Thrown by {@link Webhook#verify} when a request isn't a genuine, recent Delivrie webhook. */
public class WebhookVerificationException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  public WebhookVerificationException(String message) { super(message); }
}
