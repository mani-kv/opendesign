import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import z from "zod"
import { Feature } from "../../feature"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

export const FeatureRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List features",
        description: "Get a list of features, optionally filtered by product.",
        operationId: "feature.list",
        responses: {
          200: {
            description: "List of features",
            content: {
              "application/json": {
                schema: resolver(Feature.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          productID: z.string().optional().meta({ description: "Filter by product ID" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const features: Feature.Info[] = []
        for (const feature of Feature.list({ productID: query.productID })) {
          features.push(feature)
        }
        return c.json(features)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create feature",
        description: "Create a new feature within a product.",
        operationId: "feature.create",
        responses: {
          200: {
            description: "Created feature",
            content: {
              "application/json": {
                schema: resolver(Feature.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          productID: z.string().meta({ description: "Product ID" }),
          name: z.string().meta({ description: "Feature name" }),
          branch: z.string().meta({ description: "Git branch name" }),
          figmaUrl: z.string().optional().meta({ description: "Figma URL" }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const feature = await Feature.create(body)
        return c.json(feature)
      },
    )
    .get(
      "/:featureID",
      describeRoute({
        summary: "Get feature",
        description: "Retrieve a specific feature.",
        operationId: "feature.get",
        responses: {
          200: {
            description: "Feature details",
            content: {
              "application/json": {
                schema: resolver(Feature.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ featureID: z.string() })),
      async (c) => {
        const feature = await Feature.get(c.req.valid("param").featureID)
        return c.json(feature)
      },
    )
    .put(
      "/:featureID",
      describeRoute({
        summary: "Update feature",
        description: "Update a feature.",
        operationId: "feature.update",
        responses: {
          200: {
            description: "Updated feature",
            content: {
              "application/json": {
                schema: resolver(Feature.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ featureID: z.string() })),
      validator(
        "json",
        z.object({
          name: z.string().optional(),
          status: z.enum(["active", "completed", "archived"]).optional(),
          figmaUrl: z.string().optional(),
          canvasState: z.any().optional(),
        }),
      ),
      async (c) => {
        const id = c.req.valid("param").featureID
        const body = c.req.valid("json")
        const feature = await Feature.update({ id, ...body })
        return c.json(feature)
      },
    )
    .delete(
      "/:featureID",
      describeRoute({
        summary: "Delete feature",
        description: "Delete a feature and all its agents.",
        operationId: "feature.remove",
        responses: {
          200: {
            description: "Deleted",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ featureID: z.string() })),
      async (c) => {
        await Feature.remove(c.req.valid("param").featureID)
        return c.json(true)
      },
    ),
)
