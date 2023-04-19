import { max } from "moment"

export const formatTitle = (name: string | undefined): string => {
  const rootTitle = 'H3 Historian'

  if (!name) {
    return rootTitle
  }

  const maxTitleLength = 64
  const titleSuffix = ` - ${rootTitle}`
  const fullTitle = `${name}${titleSuffix}`
  if (fullTitle.length < maxTitleLength) {
    return fullTitle
  }

  const trucatedName = name.substring(0, Math.min(name.length, maxTitleLength - titleSuffix.length - 2 /* ellipsis */))
  return `${trucatedName}\u2026${titleSuffix}`
}

export const setTitle = (name: string | undefined): void => {
  document.title= formatTitle(name)
}