package io.delivrie;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A small JSON reader and writer, so the SDK has no dependencies. Objects read as {@code Map<String, Object>} (in
 * order), arrays as {@code List<Object>}, numbers as {@code Long} or {@code Double}, plus String, Boolean and null.
 * Writing accepts the same types, plus any Number, arrays, and Collections.
 */
public final class Json {
  private Json() {}

  /** Serialises maps, lists, strings, numbers, booleans and null. */
  public static String write(Object v) {
    StringBuilder sb = new StringBuilder();
    write(sb, v);
    return sb.toString();
  }

  @SuppressWarnings("unchecked")
  private static void write(StringBuilder sb, Object v) {
    if (v == null) sb.append("null");
    else if (v instanceof String s) str(sb, s);
    else if (v instanceof Boolean b) sb.append(b);
    else if (v instanceof Double d && (d.isNaN() || d.isInfinite())) sb.append("null");
    else if (v instanceof Float f && (f.isNaN() || f.isInfinite())) sb.append("null");
    else if (v instanceof Number n) sb.append(n instanceof BigDecimal bd ? bd.toPlainString() : n.toString());
    else if (v instanceof Map<?, ?> m) {
      sb.append('{');
      boolean first = true;
      for (Map.Entry<?, ?> e : m.entrySet()) {
        if (!first) sb.append(',');
        first = false;
        str(sb, String.valueOf(e.getKey()));
        sb.append(':');
        write(sb, e.getValue());
      }
      sb.append('}');
    } else if (v instanceof Collection<?> c) {
      sb.append('[');
      boolean first = true;
      for (Object o : c) {
        if (!first) sb.append(',');
        first = false;
        write(sb, o);
      }
      sb.append(']');
    } else if (v instanceof Object[] a) write(sb, List.of(a));
    else if (v instanceof java.time.temporal.TemporalAccessor t) str(sb, t.toString());
    else if (v instanceof Enum<?> e) str(sb, e.name());
    else str(sb, v.toString());
  }

  private static void str(StringBuilder sb, String s) {
    sb.append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"' -> sb.append("\\\"");
        case '\\' -> sb.append("\\\\");
        case '\n' -> sb.append("\\n");
        case '\r' -> sb.append("\\r");
        case '\t' -> sb.append("\\t");
        case '\b' -> sb.append("\\b");
        case '\f' -> sb.append("\\f");
        default -> {
          if (c < 0x20 || c == 0x2028 || c == 0x2029) sb.append(String.format("\\u%04x", (int) c));
          else sb.append(c);
        }
      }
    }
    sb.append('"');
  }

  /** Parses JSON text. Throws IllegalArgumentException on invalid input. */
  public static Object parse(String text) {
    Reader r = new Reader(text);
    r.ws();
    Object v = r.value();
    r.ws();
    if (r.i != text.length()) throw r.err("Unexpected trailing characters");
    return v;
  }

  private static final class Reader {
    final String s;
    int i;

    Reader(String s) { this.s = s; }

    IllegalArgumentException err(String m) { return new IllegalArgumentException(m + " at position " + i); }

    void ws() { while (i < s.length() && " \t\r\n".indexOf(s.charAt(i)) >= 0) i++; }

    Object value() {
      if (i >= s.length()) throw err("Unexpected end of JSON");
      char c = s.charAt(i);
      if (c == '{') return obj();
      if (c == '[') return arr();
      if (c == '"') return string();
      if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
      if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
      if (s.startsWith("null", i)) { i += 4; return null; }
      if (c == '-' || (c >= '0' && c <= '9')) return number();
      throw err("Unexpected character '" + c + "'");
    }

    Map<String, Object> obj() {
      Map<String, Object> m = new LinkedHashMap<>();
      i++; ws();
      if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
      while (true) {
        ws();
        if (i >= s.length() || s.charAt(i) != '"') throw err("Expected a key");
        String k = string();
        ws();
        if (i >= s.length() || s.charAt(i) != ':') throw err("Expected ':'");
        i++; ws();
        m.put(k, value());
        ws();
        if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
        if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
        throw err("Expected ',' or '}'");
      }
    }

    List<Object> arr() {
      List<Object> l = new ArrayList<>();
      i++; ws();
      if (i < s.length() && s.charAt(i) == ']') { i++; return l; }
      while (true) {
        ws();
        l.add(value());
        ws();
        if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
        if (i < s.length() && s.charAt(i) == ']') { i++; return l; }
        throw err("Expected ',' or ']'");
      }
    }

    String string() {
      StringBuilder sb = new StringBuilder();
      i++;
      while (i < s.length()) {
        char c = s.charAt(i++);
        if (c == '"') return sb.toString();
        if (c != '\\') { sb.append(c); continue; }
        if (i >= s.length()) break;
        char e = s.charAt(i++);
        switch (e) {
          case '"', '\\', '/' -> sb.append(e);
          case 'n' -> sb.append('\n');
          case 'r' -> sb.append('\r');
          case 't' -> sb.append('\t');
          case 'b' -> sb.append('\b');
          case 'f' -> sb.append('\f');
          case 'u' -> {
            if (i + 4 > s.length()) throw err("Bad unicode escape");
            sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
            i += 4;
          }
          default -> throw err("Bad escape");
        }
      }
      throw err("Unterminated string");
    }

    Object number() {
      int start = i;
      if (s.charAt(i) == '-') i++;
      while (i < s.length() && "0123456789.eE+-".indexOf(s.charAt(i)) >= 0) i++;
      String n = s.substring(start, i);
      if (n.contains(".") || n.contains("e") || n.contains("E")) return Double.parseDouble(n);
      BigInteger b = new BigInteger(n);
      return b.bitLength() < 64 ? (Object) b.longValue() : (Object) new BigDecimal(b);
    }
  }
}
