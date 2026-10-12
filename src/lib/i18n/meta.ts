// Titre et description de page traduits (balises <head>), d'après la langue
// fournie par la route racine.
import { DICTIONARIES, type Dict } from "./index";
import { DEFAULT_LANG, isLang } from "./lang";

type HeadContext = { matches: Array<{ loaderData?: unknown }> };

export function pageHead(key: keyof Dict["meta"], opts: { noindex?: boolean } = {}) {
  return ({ matches }: HeadContext) => {
    const data = matches[0]?.loaderData as { lang?: unknown } | undefined;
    const lang = isLang(data?.lang) ? data.lang : DEFAULT_LANG;
    const { title, description } = DICTIONARIES[lang].meta[key];
    return {
      meta: [
        { title },
        ...(description
          ? [
              { name: "description", content: description },
              { property: "og:title", content: title },
              { property: "og:description", content: description },
            ]
          : []),
        { property: "og:type", content: "website" },
        ...(opts.noindex ? [{ name: "robots", content: "noindex" }] : []),
      ],
    };
  };
}
