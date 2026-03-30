import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Figma } from "../../figma"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

export const FigmaRoutes = lazy(() =>
  new Hono()
    .get(
      "/auth/status",
      describeRoute({
        summary: "Figma auth status",
        description: "Check if the user is authenticated with Figma.",
        operationId: "figma.auth.status",
        responses: {
          200: {
            description: "Auth status",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    authenticated: z.boolean(),
                    clientId: z.string(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json({
          authenticated: await Figma.isAuthenticated(),
          clientId: Figma.clientId(),
        })
      },
    )
    .get(
      "/auth/url",
      describeRoute({
        summary: "Get Figma OAuth URL",
        description: "Generate the Figma OAuth authorization URL.",
        operationId: "figma.auth.url",
        responses: {
          200: {
            description: "OAuth URL",
            content: {
              "application/json": {
                schema: resolver(z.object({ url: z.string() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({
          redirect_uri: z.string().describe("OAuth redirect URI"),
        }),
      ),
      async (c) => {
        const { redirect_uri } = c.req.valid("query")
        try {
          const url = Figma.getAuthUrl(redirect_uri)
          return c.json({ url })
        } catch (e: any) {
          return c.json({ error: e.message }, 400)
        }
      },
    )
    .post(
      "/auth/callback",
      describeRoute({
        summary: "Complete Figma OAuth",
        description: "Exchange the authorization code for access/refresh tokens.",
        operationId: "figma.auth.callback",
        responses: {
          200: {
            description: "Authentication successful",
            content: {
              "application/json": {
                schema: resolver(z.object({ authenticated: z.boolean() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          code: z.string().describe("Authorization code from Figma"),
          redirect_uri: z.string().describe("Redirect URI used in the auth request"),
          state: z.string().describe("CSRF state parameter returned by Figma"),
        }),
      ),
      async (c) => {
        const { code, redirect_uri, state } = c.req.valid("json")
        try {
          await Figma.exchangeCode(code, redirect_uri, state)
          return c.json({ authenticated: true })
        } catch (e: any) {
          return c.json({ error: e.message }, 400)
        }
      },
    )
    .post(
      "/auth/disconnect",
      describeRoute({
        summary: "Disconnect Figma",
        description: "Remove stored Figma OAuth tokens.",
        operationId: "figma.auth.disconnect",
        responses: {
          200: {
            description: "Disconnected",
            content: {
              "application/json": {
                schema: resolver(z.object({ authenticated: z.boolean() })),
              },
            },
          },
        },
      }),
      async (c) => {
        await Figma.disconnect()
        return c.json({ authenticated: false })
      },
    )
    .post(
      "/image",
      describeRoute({
        summary: "Get Figma image",
        description: "Fetch a rendered PNG of a Figma node via the REST API.",
        operationId: "figma.image",
        responses: {
          200: {
            description: "Image URL",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    imageUrl: z.string().nullable(),
                    err: z.string().nullable(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      validator(
        "json",
        z.object({
          fileKey: z.string().describe("Figma file key"),
          nodeId: z.string().describe("Figma node ID"),
          scale: z.number().optional().default(2),
          format: z.string().optional().default("png"),
        }),
      ),
      async (c) => {
        const { fileKey, nodeId, scale, format } = c.req.valid("json")
        try {
          const result = await Figma.getImage(fileKey, nodeId, { scale, format })
          const imageUrl = result.images[nodeId] ?? result.images[Object.keys(result.images)[0]] ?? null
          return c.json({ imageUrl, err: result.err })
        } catch (e: any) {
          if (e.code === "figma_auth_required") return c.json({ error: "Not authenticated with Figma" }, 401)
          return c.json({ error: e.message }, 400)
        }
      },
    )
    .post(
      "/image/proxy",
      describeRoute({
        summary: "Proxy and cache Figma image",
        description: "Fetch a Figma image URL and return it as a base64 data URI.",
        operationId: "figma.image.proxy",
        responses: {
          200: {
            description: "Base64 data URI of the image",
            content: {
              "application/json": {
                schema: resolver(z.object({ dataUri: z.string() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          url: z.string().describe("The expiring Figma image URL to proxy"),
        }),
      ),
      async (c) => {
        const { url } = c.req.valid("json")
        try {
          const res = await fetch(url)
          if (!res.ok) return c.json({ error: `Image fetch failed: ${res.status}` }, 400)
          const contentType = res.headers.get("content-type") ?? "image/png"
          const buffer = await res.arrayBuffer()
          const b64 = Buffer.from(buffer).toString("base64")
          const dataUri = `data:${contentType};base64,${b64}`
          return c.json({ dataUri })
        } catch (e: any) {
          return c.json({ error: e.message }, 400)
        }
      },
    )
    .post(
      "/nodes",
      describeRoute({
        summary: "Get Figma file nodes",
        description: "Fetch node tree data for specific nodes in a Figma file.",
        operationId: "figma.nodes",
        responses: {
          200: {
            description: "Node data",
            content: {
              "application/json": {
                schema: resolver(z.object({ name: z.string(), nodes: z.record(z.string(), z.unknown()) })),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      validator(
        "json",
        z.object({
          fileKey: z.string(),
          nodeIds: z.array(z.string()),
        }),
      ),
      async (c) => {
        const { fileKey, nodeIds } = c.req.valid("json")
        try {
          const result = await Figma.getFileNodes(fileKey, nodeIds)
          return c.json(result)
        } catch (e: any) {
          if (e.code === "figma_auth_required") return c.json({ error: "Not authenticated with Figma" }, 401)
          return c.json({ error: e.message }, 400)
        }
      },
    ),
)
