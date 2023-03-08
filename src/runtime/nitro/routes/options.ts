import { createError, defineEventHandler, getHeaders, getQuery } from 'h3'
import type { OgImageOptions } from '../../../types'
import { useHostname } from '../utils'
import { getRouteRules } from '#internal/nitro'
import { defaults } from '#nuxt-og-image/config'

export function extractOgImageOptions(html: string) {
  // extract the options from our script tag
  const options = html.match(/<script id="nuxt-og-image-options" type="application\/json">(.+?)<\/script>/)?.[1]
  return options ? JSON.parse(options) : false
}

export const inferOgImageOptions = (html: string) => {
  const options: OgImageOptions = {}
  // extract the og:description from the html
  const description = html.match(/<meta property="og:description" content="(.*?)">/)?.[1]
  if (description)
    options.description = description
  else
    options.description = html.match(/<meta name="description" content="(.*?)">/)?.[1]
  return options
}

export default defineEventHandler(async (e) => {
  const query = getQuery(e)
  const path = query.path as string || '/'

  // extract the payload from the original path
  const fetchOptions = (process.dev || process.env.prerender)
    ? {}
    : {
        headers: getHeaders(e),
        baseURL: useHostname(e),
      }
  const html = await globalThis.$fetch<string>(path, {
    ...fetchOptions,
  })
  const extractedPayload = extractOgImageOptions(html)
  // not supported
  if (!extractedPayload) {
    throw createError({
      statusCode: 500,
      statusMessage: `The path ${path} is missing the og-image payload.`,
    })
  }

  // need to hackily reset the event params so we can access the route rules of the base URL
  e.node.req.url = path
  e.context._nitro.routeRules = undefined
  const routeRules = getRouteRules(e)?.ogImage
  e.node.req.url = e.path

  // has been disabled via route rules
  if (routeRules === false)
    return false

  return {
    path,
    ...defaults,
    // use inferred data
    ...inferOgImageOptions(html),
    // use route rules
    ...(routeRules || {}),
    // use provided data
    ...extractedPayload,
    // use query data
    ...query,
  } as OgImageOptions
})
