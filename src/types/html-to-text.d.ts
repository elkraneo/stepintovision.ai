declare module "html-to-text" {
  export interface HtmlToTextOptions {
    [key: string]: unknown
  }

  export function htmlToText(html: string, options?: HtmlToTextOptions): string
}
