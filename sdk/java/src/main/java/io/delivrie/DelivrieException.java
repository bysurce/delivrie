package io.delivrie;

/**
 * Thrown for any failed request. {@link #status()} is the HTTP status (0 for network errors and timeouts) and
 * {@link #name()} is Delivrie's error name, like "validation_error", "invalid_api_key" or "rate_limit_exceeded".
 */
public class DelivrieException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  private final int status;
  private final String name;

  public DelivrieException(String message, int status, String name) {
    super(message);
    this.status = status;
    this.name = name;
  }

  public DelivrieException(String message, int status, String name, Throwable cause) {
    super(message, cause);
    this.status = status;
    this.name = name;
  }

  public int status() { return status; }

  public String name() { return name; }

  static DelivrieException fromResponse(int status, Object json, String raw) {
    java.util.Map<?, ?> j = json instanceof java.util.Map<?, ?> m ? m : java.util.Map.of();
    String name = j.get("name") instanceof String s ? s : switch (status) {
      case 401 -> "invalid_api_key";
      case 404 -> "not_found";
      case 429 -> "rate_limit_exceeded";
      default -> "application_error";
    };
    String body = raw == null ? "" : raw.substring(0, Math.min(raw.length(), 300)).trim();
    String message = j.get("message") instanceof String s ? s : (body.isEmpty() ? "Request failed with status " + status : body);
    int code = j.get("statusCode") instanceof Number n ? n.intValue() : status;
    return new DelivrieException(message, code, name);
  }
}
