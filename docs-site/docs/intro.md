---
title: Overview
slug: /
sidebar_position: 1
---

`intent-compiler` turns natural-language backend prompts into precompiled query logic.

Core flow:

1. Run onboarding with `intent-compiler init`
2. Build your app and write prompt templates with `aiDb.prepare`
3. Run `npm run compile-intent`
4. Execute precompiled intents at runtime with your own DB adapter

This keeps prompt variables parameterized, query text deterministic, and runtime behavior fast.
