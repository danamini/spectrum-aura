import { describe, expect, it } from "vitest";
import { KEY_BINDINGS, actionForKey, capFor, keyCap, keyName } from "../keymap";

describe("keymap", () => {
  it("names keys the way the table writes them", () => {
    expect(keyName({ key: "r" })).toBe("r");
    expect(keyName({ key: "R", shiftKey: true })).toBe("Shift+r");
    expect(keyName({ key: " " })).toBe("Space");
    expect(keyName({ key: "ArrowLeft", shiftKey: true })).toBe("Shift+ArrowLeft");
    // Punctuation is taken as typed, whatever modifier produced it.
    expect(keyName({ key: "?", shiftKey: true })).toBe("?");
    expect(keyName({ key: "+", shiftKey: true })).toBe("+");
  });

  it("resolves the taught keys", () => {
    expect(actionForKey({ key: "ArrowRight" })).toBe("nextView");
    expect(actionForKey({ key: "ArrowDown" })).toBe("nextLook");
    expect(actionForKey({ key: " " })).toBe("playLooks");
    expect(actionForKey({ key: "h" })).toBe("hideControls");
    expect(actionForKey({ key: "i" })).toBe("inputSource");
    expect(actionForKey({ key: "?", shiftKey: true })).toBe("help");
    expect(actionForKey({ key: "R", shiftKey: true })).toBe("randomLook");
    expect(actionForKey({ key: "T", shiftKey: true })).toBe("tapDownbeat");
    expect(actionForKey({ key: "z" })).toBeNull();
  });

  it("keeps every older key working", () => {
    expect(actionForKey({ key: "b" })).toBe("prevView");
    expect(actionForKey({ key: "v" })).toBe("nextView");
    expect(actionForKey({ key: "a" })).toBe("playLooks");
    expect(actionForKey({ key: "g" })).toBe("hideControls");
    expect(actionForKey({ key: "x" })).toBe("inputSource");
    expect(actionForKey({ key: "[" })).toBe("prevLook");
    expect(actionForKey({ key: "]" })).toBe("nextLook");
    expect(actionForKey({ key: "\\" })).toBe("randomLook");
    expect(actionForKey({ key: "ArrowRight", shiftKey: true })).toBe("nextLook");
    expect(actionForKey({ key: "=" })).toBe("responseUp");
  });

  it("gives every action a label, a group and at least one key", () => {
    const actions = new Set<string>();
    for (const binding of KEY_BINDINGS) {
      expect(binding.label.length).toBeGreaterThan(3);
      expect(binding.keys.length).toBeGreaterThan(0);
      expect(actions.has(binding.action)).toBe(false);
      actions.add(binding.action);
    }
  });

  it("prints key caps", () => {
    expect(keyCap("ArrowLeft")).toBe("←");
    expect(keyCap("Shift+r")).toBe("⇧R");
    expect(keyCap("Space")).toBe("Space");
    expect(capFor("help")).toBe("?");
    expect(capFor("hideControls")).toBe("H");
  });
});
