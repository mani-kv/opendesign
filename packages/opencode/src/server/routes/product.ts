import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { Instance } from "../../project/instance"
import { Product } from "../../product"
import z from "zod"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { InstanceBootstrap } from "../../project/bootstrap"

export const ProductRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List all products",
        description: "Get a list of products that have been opened with OpenCode.",
        operationId: "product.list",
        responses: {
          200: {
            description: "List of products",
            content: {
              "application/json": {
                schema: resolver(Product.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const products = await Product.list()
        return c.json(products)
      },
    )
    .get(
      "/current",
      describeRoute({
        summary: "Get current product",
        description: "Retrieve the currently active product that OpenCode is working with.",
        operationId: "product.current",
        responses: {
          200: {
            description: "Current product information",
            content: {
              "application/json": {
                schema: resolver(Product.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(Instance.project)
      },
    )
    .post(
      "/git/init",
      describeRoute({
        summary: "Initialize git repository",
        description: "Create a git repository for the current product and return the refreshed product info.",
        operationId: "product.initGit",
        responses: {
          200: {
            description: "Product information after git initialization",
            content: {
              "application/json": {
                schema: resolver(Product.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        const dir = Instance.directory
        const prev = Instance.project
        const next = await Product.initGit({
          directory: dir,
          project: prev,
        })
        if (next.id === prev.id && next.vcs === prev.vcs && next.worktree === prev.worktree) return c.json(next)
        await Instance.reload({
          directory: dir,
          worktree: dir,
          project: next,
          init: InstanceBootstrap,
        })
        return c.json(next)
      },
    )
    .patch(
      "/:projectID",
      describeRoute({
        summary: "Update product",
        description: "Update product properties such as name, icon, and commands.",
        operationId: "product.update",
        responses: {
          200: {
            description: "Updated product information",
            content: {
              "application/json": {
                schema: resolver(Product.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ projectID: z.string() })),
      validator("json", Product.update.schema.omit({ projectID: true })),
      async (c) => {
        const projectID = c.req.valid("param").projectID
        const body = c.req.valid("json")
        const product = await Product.update({ ...body, projectID })
        return c.json(product)
      },
    ),
)
