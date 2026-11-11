// HTML-Vorlagen werden von wrangler als Text gebündelt (wrangler.toml → [[rules]]).
declare module '*.html' {
  const text: string
  export default text
}
