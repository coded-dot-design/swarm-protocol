// Highlight once during the Astro build; no tokenizer or theme script in the browser.
const theme = (name: string, type: "light" | "dark", palette: string[]) => ({
  name,
  type,
  colors: {
    "editor.background": palette[0]!,
    "editor.foreground": palette[1]!,
  },
  tokenColors: [
    {
      scope: ["comment"],
      settings: { foreground: palette[2]!, fontStyle: "italic" },
    },
    { scope: ["keyword", "storage"], settings: { foreground: palette[3]! } },
    { scope: ["string"], settings: { foreground: palette[4]! } },
    {
      scope: ["constant.numeric", "constant.language"],
      settings: { foreground: palette[5]! },
    },
    {
      scope: ["entity.name.function", "support.function"],
      settings: { foreground: palette[6]! },
    },
    {
      scope: ["variable.other.property", "support.type.property-name"],
      settings: { foreground: palette[7]! },
    },
    { scope: ["punctuation"], settings: { foreground: palette[8]! } },
  ],
});
export const codeThemes = {
  light: theme("dom-virus-light", "light", [
    "#fafbfd",
    "#273446",
    "#637184",
    "#bf2d5b",
    "#237446",
    "#9c5911",
    "#086e94",
    "#7252b7",
    "#667180",
  ]),
  dark: theme("dom-virus-dark", "dark", [
    "#171222",
    "#eae7f2",
    "#9c99b2",
    "#ef7fa7",
    "#8ed9ad",
    "#e9bd79",
    "#8cd5e9",
    "#c0aff0",
    "#a6a3bb",
  ]),
};
