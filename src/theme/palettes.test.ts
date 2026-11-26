import { test } from "node:test"
import assert from "node:assert/strict"
import { THEME_IDS, PALETTES, resolveTheme, themeColor, themeStyles } from "./palettes.ts"

test("four palettes, backwards compatible default", () => {
  assert.equal(THEME_IDS.length, 4)
  for (const theme of THEME_IDS) assert.equal(resolveTheme(theme), theme)
  for (const bad of [null, undefined, 3, "unknown"]) assert.equal(resolveTheme(bad), "cyber")
  assert.equal(new Set(THEME_IDS.map(id => PALETTES[id].bg)).size, 4)
})

test("semantic colors and non-color style fields stay unchanged", () => {
  const styles = { row: { backgroundColor: "#07080c", color: "#8a93a8", borderColor: "#ff4d6d", padding: 8, transform: [{ scale: 1 }] } }
  assert.equal(themeStyles(styles, "cyber"), styles)
  for (const theme of THEME_IDS.slice(1)) {
    const result = themeStyles(styles, theme)
    assert.equal(result.row.backgroundColor, PALETTES[theme].bg)
    assert.equal(result.row.color, PALETTES[theme].muted)
    assert.equal(result.row.borderColor, "#ff4d6d")
    assert.equal(result.row.padding, 8)
    assert.equal(result.row.transform, styles.row.transform)
    assert.equal(themeColor("#34f5a5", theme), "#34f5a5")
  }
  assert.equal(styles.row.backgroundColor, "#07080c")
})
