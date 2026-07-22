---
title: Agentic Intake Workflows
type: design-index
tags: [agentic-intake, workflow, simulation-routing, dynamic-form]
created: 2026-05-04
updated: 2026-05-04
status: draft
related: [[../llm-gateway-orchestration]], [[../../functional/overview]], [[../../functional/01-creative-testing]], [[../../prd]]
---

# Agentic Intake Workflows

This folder stores the product and workflow design for KoreaSim's agentic intake layer.

The goal is to replace fixed simulation-first chat steps with a goal-first assistant that:

- understands what the user wants to decide or create.
- chooses the right simulation internally.
- asks for only the information that is truly needed.
- renders compact forms when structured input is faster than chat.
- auto-generates reasonable missing values when the user cannot provide them.
- records every assumption so the final report can explain what was user-provided versus inferred.

## Documents

| Document | Purpose |
| --- | --- |
| [[universal-agentic-intake-workflow]] | Common algorithm for all 9 simulation types. |
| [[simulation-intake-pack-standard]] | Hybrid architecture contract for simulation-specific intake packs. |
| [[intake-ux-policy]] | Turn-by-turn UX policy for questions, forms, assumptions, and run readiness. |
| [[intake-evaluation-fixtures-plan]] | Fixture and regression plan for routing, slot extraction, planning, and payload validity. |
| [[creative-testing-intake-v1]] | First implementation target for creative/headline/copy testing. |
| [[session-history-and-new-run]] | New simulation reset behavior, chat history UX, SQLite session schema, and Cloudflare/auth notes. |
| [[n8n-node-algorithm]] | n8n-style node graph and node contracts for prototyping or orchestration mapping. |

## Research Basis

The design intentionally starts with a small, deterministic workflow plus LLM reasoning at ambiguity points. This follows the same direction as current agent guidance:

- OpenAI frames agents as systems that use models, tools, instructions, and guardrails to operate multi-step workflows; practical production agents should have clear tool boundaries and explicit controls. Source: [OpenAI, A practical guide to building AI agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/).
- Anthropic recommends keeping agent systems simple first, using workflow patterns such as prompt chaining, routing, evaluator-optimizer, and orchestrator-workers only when the task needs them. Source: [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).
- LangGraph emphasizes persistence/checkpointing, human-in-the-loop, and durable state for long-running agent workflows. Source: [LangGraph persistence documentation](https://docs.langchain.com/oss/javascript/langgraph/persistence).
- n8n's AI Agent node model maps well to a prototype where the agent can call tools and APIs but the product still controls session state, validation, and final run creation. Source: [n8n AI Agent node docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/).

## Product Principle

KoreaSim should not ask the user to understand the 9 simulation types first.

The user should be able to say:

> "제 상품 상세페이지 헤드라인을 만들고 싶어요."

Then the system should infer:

- likely task: generate and test headline candidates.
- likely simulation: `creative_testing`.
- required information: product, headline surface, target customer, candidate texts or permission to generate them.
- next best UI: one clarifying question first, then a compact form.

This folder defines that behavior as a reusable engine.
