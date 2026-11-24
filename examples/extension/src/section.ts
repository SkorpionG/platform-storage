/**
 * The options page's tabs by id.
 *
 * An id is also the URL hash that opens its tab, so everything that links to a tab, the tour included, names it through here rather than retyping the string.
 */
export const SECTION = {
  Tour: "tour",
  Values: "values",
  BadData: "bad-data",
  Areas: "areas",
  Contexts: "contexts",
  Schema: "schema",
} as const;

export type SectionId = (typeof SECTION)[keyof typeof SECTION];

/** What each tab is called, on the tab and in a link to it. */
export const SECTION_LABEL: { readonly [Id in SectionId]: string } = {
  [SECTION.Tour]: "Tour",
  [SECTION.Values]: "Values",
  [SECTION.BadData]: "Bad data",
  [SECTION.Areas]: "Areas",
  [SECTION.Contexts]: "Contexts",
  [SECTION.Schema]: "Schema",
};
