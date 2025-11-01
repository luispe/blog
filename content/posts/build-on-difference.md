---
categories:
- idp
date: "2025-11-01T00:00:00-03:00"
description: The how and why behind our IDP — built from our differences
tags:
- platform-engineering
- idp
title: Building from Differences
toc: true
---

In this post, I’ll try to share our experience building Akua’s IDP — the challenges we faced, the current state, and what lies ahead.

With [Ger](https://www.linkedin.com/in/geryepes/) — at this point I can proudly call him a friend — we joined Akua from the very beginning with the goal of building the internal developer platform. We both came from different industries and backgrounds, but shared a deep common vision of what Akua needed.

I left the link to his LinkedIn, but to give a **very short (and disrespectfully brief)** summary: Ger comes with experience from the lowest layers of infrastructure all the way up to building the team and platform at *Sate* (for friends), or [Satellogic](https://www.linkedin.com/company/satellogic/) if we’re being formal.

In my case, I started my career as a product developer and, during my time at Viacom (Telefé), I began to feel a strong curiosity for infrastructure. At Pomelo, I had the chance to work full-time helping to build the IDP, and at Akua, together with my “compa,” we designed and executed it from scratch — something I’m incredibly proud of.

## Early Days and First Steps

We started literally with a blank page. There was absolutely nothing in Akua — just an empty AWS account — but that was the least of our concerns.
Here’s a list of our “mantras,” which we still uphold to this day:

- Platform operation and maintenance should tend toward zero.
- Everything we build must be testable and runnable locally — without being a nightmare to do so.
- If it works in development, it must work in production (or any other lifecycle stage).
- Everything should be self-discoverable — no hardcoding.
- Simplicity above all.
- Break the inertia of past experiences.

### Laying the Foundations

We partnered with Binbash to execute our PCI-compliant network design, while Ger and I evaluated which tool would best fit our infrastructure management needs for the IDP.
To be fully transparent, we evaluated three tools — discarded one immediately, and ran quick POCs with the other two before deciding.

The three tools we analyzed:

- **Terraform CDK** — We discarded it from day one. Why? Terraform’s direction was becoming less open source, and (at least at that time) Terraform CDK lacked proper documentation — something that kills us both given our working style.

- **Crossplane** — Tempting at first, but as soon as you need to add logic to a product your platform provides, you’re in trouble. Let’s be honest — YAML is too fragile to handle platform product logic.

- **Pulumi** — You probably guessed it: we chose Pulumi. It gave us flexibility to implement any logic we wanted, abstracted away the state management complexity, had stellar documentation, and strong community adoption. That last point mattered a lot — when we onboard new teammates, they won’t be facing an obscure stack.
  And not least — Pulumi lets you implement **Dynamic Providers**, meaning if a resource isn’t supported, you can still manage it via Pulumi interfaces. In our case, we had to do that twice — once with Typesense and another with “deployment markers” in New Relic.

I should clarify — neither of us had used Pulumi in production before. We had tested and explored it, but this was our first time using it in a real-world, mission-critical context.

Once we chose our backend tool, we moved to the next layer of our IDP: the presentation layer.

As the title suggests, here’s where our **differences** came into play.
Ger, coming from a deeply technical background and teams that value full control, proposed exposing platform products directly — meaning developers would use Pulumi themselves.
My take was different — I believed Akua’s developers wouldn’t feel comfortable having to use a platform tool directly. We needed a **presentation layer (aka portal)** where they could design, deploy, and manage projects.

For this layer, we analyzed two tools: **Backstage** and **Port.io**.
There are more, of course, but as always, we focused on those with strong adoption across the industry — so anyone joining the team wouldn’t face something too niche.

We ended up choosing **Port.io**. Why? Backstage would’ve required us to build custom frontend components — something outside our expertise and timeline.
Port.io, on the other hand, wasn’t a fallback choice — it’s like the *Notion for platforms*. Its Blueprint system lets you design your platform around your needs, not the other way around.
The UI is elegant, it supports SSO, has RBAC (still room for improvement), and includes Scorecards, Self-Service Actions, Automations, and click-and-build dashboards.
All in all, it became the perfect tool for our platform’s presentation layer.

### Technology Stack

We built a custom Helm chart for our applications. Over time, it evolved and now supports both microservices and monorepos — meaning multiple services can be deployed from a single GitLab project without having to manage “n” repositories.

Our Helm chart is centralized, versioned (using semver), and evolves like any other piece of software. Product developers can choose whichever version they need.
The idea was to **centralize evolution** while minimizing cognitive load for developers.
Each project defines its own `values.yaml`, which are used at deployment time — that’s it.

For CI/CD, we use **GitLab**. Ger’s experience here was key — we use private runners that sync application resources without distributing AWS credentials across GitLab, avoiding major security risks.

Speaking of GitLab, we know from experience that pipeline updates are a pain when every project has its own.
So we built **centralized pipelines**, and projects simply `include` them.
Need something new? Add it to the central pipeline, and everyone gets it automatically — semver, of course, to evolve without breaking things.

As for orchestration — yes, we use **Kubernetes**. But with a twist: **EKS on Fargate**.
That was Ger’s proposal, and thankfully we convinced everyone to go that route.

Why Fargate?
- Almost zero operational overhead.
- Upgrading Kubernetes versions is trivial.
- PCI compliant.
- And overall, much simpler.

Of course, there are trade-offs — for example, you can’t deploy DaemonSets — but we’re fine with that. Our mantra is **keep it simple**, and our EKS clusters only run:
- Kong
- Metrics Server
- External DNS

And yes, installing anything else needs a **very strong justification**.

#### Wait, what about secrets?

We built a workflow with **Parameter Store** that lets us deploy and inject secrets into Kubernetes applications.
If a secret isn’t managed by our infra-lib, the security team can still add it to Parameter Store, and our infra-lib takes care of the rest.

#### Security — Auth & Authz

From day one, we’ve used **IRSA (IAM Roles for Service Accounts)** and **tag-based permissions** (more on that later).
If an AWS resource doesn’t support tagging (like S3), our infra-lib auto-discovers it and applies the right permissions.

Someone once commented on a previous post that “a platform without FinOps can’t be called a platform.”
So, let’s clarify — all our infrastructure resources are centrally tagged by our infra-lib.
That’s what will make it easy to implement cost tracking and billing later.
And a quick side note — our infra costs turned out to be *significantly lower* than we had projected, thanks to proper environment configurations handled by our infra-lib.

Continuing with security — database access is controlled via **Security Group rules**, and communication between applications is blocked at the network level (even within the same namespace).
This allows us to define and enforce access rules between services through **Kong**, easily configurable from our Port.io portal.

## Conclusions

There’s still so much to share — how we implemented Scorecards, Day-2 actions, single-tenant deployments, public route publishing…
But I’ll save that for another post :)

For now, I’d like to close with a reflection.

As I mentioned, we didn’t always agree — but we learned to build our internal developer platform *from our differences*, while always respecting each other’s perspective.
We created a workflow that led us to design and deliver solid, long-term solutions.
Were all the ideas Ger’s? Mine? Honestly, it doesn’t matter.
We built a shared process where we analyze, design, and evaluate multiple approaches before implementing — real teamwork, where what truly matters is the platform and, above all, the people behind it.

Ger, my friend — thank you deeply for your generosity and for teaching me so much.
I hope I left some marks of my own too.
It’s been an honor and a joy to build this platform — and even more so, the friendship that came with it. That one’s for life ❤️

See you next time 👋🏽
