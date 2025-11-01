---
categories:
- idp
date: "2025-11-01T00:00:00-03:00"
description: The how and why of our IDP from the differences
tags:
- platform-engineering
- idp
title: Building from Differences
toc: true
---

In this post, I’ll try to share our experience building the IDP at Akua — the challenges we faced, where we stand today, and what lies ahead for the platform.

Together with [Ger](https://www.linkedin.com/in/geryepes/), who at this point I can confidently call a friend since the early days of Akua, we built our internal developer platform. We come from different backgrounds and industries but share the same deep vision of what Akua needed.

I left a link to his LinkedIn, but to make a **very short (and somewhat unfair) summary**, Ger comes from a background that spans from the lowest levels of infrastructure all the way to building the team and platform at Sate (for friends), or [Satellogic](https://www.linkedin.com/company/satellogic/) if we’re being formal.

As for me, I started my career as a product developer, and already during my time at Viacom (Telefé) I developed a strong curiosity for infrastructure. At Pomelo I had the opportunity to work full-time helping to build the IDP, and at Akua, together with “my buddy,” we designed and executed it from scratch — something I’m incredibly proud of.

## The First Days and First Steps

We started with a blank sheet — literally. There was absolutely nothing at Akua. Just an empty AWS account, but that was the least of our worries.
Here’s a short list of our “mantras,” which we still uphold and make sure remain true to this day:

- The operation and maintenance of our platform must tend to zero.
- Whatever we develop must be testable locally — and it shouldn’t be a pain to do so.
- If it works in development, it must work in production (or any other environment).
- Everything should be self-discoverable — no hardcoding.
- Simplicity above all.
- Break the inertia of past experiences.

### Building the Foundations

We partnered with Binbash to execute our PCI-compliant network design while Ger and I evaluated which tool would best fit our infrastructure management needs for the IDP. To be fully transparent, we analyzed three options. We discarded one right away, and with the remaining two, we ran quick proof-of-concepts to decide which one to keep.

The three tools we evaluated were:

- **Terraform CDK** — we ruled this one out from day zero. Why? Terraform was heading in a non–open-source direction, and at that time the Terraform CDK project lacked solid documentation — something that both Ger and I can’t stand due to how we work.

- **Crossplane** — it’s tempting to use, but the moment you need to add any logic to a product your platform provides, you’re in trouble. And let’s be honest — YAML is far too fragile to entrust it with managing your platform’s products.

- **Pulumi** — as you might’ve guessed, this was our choice. It gave us the flexibility to implement any logic we wanted, abstracted away state management complexity, had excellent documentation, and a strong community adoption. That last point was key — it meant that if we grew the team in the future, new members wouldn’t face something completely unfamiliar. Finally, and importantly, Pulumi allows the implementation of **dynamic resources** — meaning if a resource isn’t natively supported, you can implement the Pulumi interface and manage it yourself. In our case (if I remember correctly), we did this twice: once for Typesense and once for New Relic deployment markers.

To clarify — neither Ger nor I had used Pulumi in production before. We knew and had tested it, but hadn’t used it at scale yet.

Once we chose our backend tool, we moved to the next phase: defining the **presentation layer** of our IDP.

As the title of this post suggests, this was where we debated from our differences.
Ger, coming from highly technical teams with a need for total control, proposed that we expose the platform’s abstractions and have developers use them directly in their projects — meaning they’d need to know how to handle Pulumi.
My perspective was that Akua’s developers wouldn’t feel comfortable dealing with platform tooling — instead, we should provide a **presentation layer (a portal)** from which they could design their project’s architecture, deploy it, and manage it.

Just like with our backend choice, two major options appeared here: **Backstage** and **Port.io**. There are others, of course, but we always aim for tools with strong industry adoption — so that anyone joining later doesn’t find something obscure.

In this case, we chose **Port.io**. Why?
Backstage would’ve forced us to build components on top of it — and at that moment, we didn’t want to touch any frontend work. It’s not our strength, and doing so would have meant significant time diversion we couldn’t afford.

Port.io wasn’t a fallback — quite the opposite. I like to describe Port as *the Notion of platforms*. Its **Blueprints** system lets you design your platform around your needs, not the other way around. The UI is elegant, supports SSO, offers RBAC (still improving), and includes features like **Scorecards**, **Self-Service Actions**, **Automations**, and **dashboards** that can be created in just a few clicks — making it the perfect choice for our platform’s presentation layer.

### Technology Stack

We developed a custom **Helm chart** for our applications. Over time, it evolved — now it supports deploying either a microservice or a **monorepo**, meaning a single project can deploy multiple Kubernetes services without needing separate GitLab projects.

Our Helm chart (as designed from day zero) is **unique**, follows **semver**, and product developers can choose any version they need depending on the functionality required.

Again, our philosophy here was to **centralize tooling and evolution**, avoiding cognitive load on our internal customers.
So, the Helm chart is shared — each project defines its own `values.yaml`, which is used at deployment time for the specific application(s).

For our CI/CD and application lifecycle management, we use **GitLab**. Ger’s deep experience here was invaluable — we run private runners that synchronize application resources without needing AWS credentials distributed in GitLab (which would be a major security risk).

Speaking of GitLab, we also know from experience how challenging it is to propagate pipeline changes across projects. That’s why we use **centralized pipelines**, where projects simply `include` them — they don’t need to worry about anything else. When something new is needed, it’s added to the central pipeline and immediately available to everyone. As always, versioned with semver to ensure safe evolution.

As I might have mentioned, our application workloads run on **Kubernetes** — specifically **EKS on Fargate**. This was Ger’s proposal, and thankfully, we were able to convince everyone necessary to go down that path.

The advantages?
Minimal Kubernetes operations, trivial upgrades, PCI compliance, and more.

Of course, there are tradeoffs — you can’t deploy DaemonSets, for example. But that doesn’t worry us too much because (returning to our mantra of simplicity), our EKS clusters have very few installed components:
- Kong
- Metrics Server
- External DNS

And yes — there must be a *very strong justification and benefit* to install anything else.

#### Wait — what about secrets?

We developed a workflow using **Parameter Store**, which allows us to deploy and make secrets available to applications flexibly. If a secret isn’t managed by our infra-lib, the security team can add it to Parameter Store and it automatically becomes available to the apps.

#### Security — Auth and Authz?

From day zero, we’ve used **IRSA (IAM Roles for Service Accounts)** with **tag-based permissions** (I’ll mention our tagging strategy shortly).
If a given AWS resource doesn’t support tags (like S3), our infra-lib can self-discover the resource and assign the required permissions automatically.

Speaking of tags — in a previous post someone criticized that “a platform without FinOps can’t be called a real platform.”
Well, since day one, every single infrastructure resource we create includes **centralized tagging** managed by our infra-lib. This will allow us to easily implement **billing** for our IDP in the future.
As a side note: our infrastructure costs are *much lower* than we predicted, thanks to correct per-environment configuration in our infra-lib.

Continuing on the security topic — access to resources like databases is managed via **security group rules** between apps and DBs. Likewise, traffic between applications is blocked at the network level, even within the same namespace. This allows us to establish service-to-service access policies managed by **Kong**, which can be configured easily from our **Port.io** portal.

## Conclusions

There’s still a lot more to cover — how we implemented scorecards, day-2 actions, or single-tenant deployments — but I’ll save that for another post.

To wrap up, I want to reflect on a few points.

As I mentioned, we didn’t always agree on everything. But we managed to build an internal developer platform **from our differences**, always respecting each other’s opinions.
We created a workflow that led us to build **solid, future-proof solutions**, and to be honest — were all the ideas Ger’s? Were they mine?
Not at all. As I said, we built a process where we **designed**, **evaluated multiple alternatives and cases**, and then **implemented**.
At the end of the day, it’s truly a team effort — what matters most is our platform and the people behind it.

Dear Ger — thank you deeply for your generosity and openness in teaching me so much.
I hope I’ve left my mark on you too. It’s an honor and a real pleasure to have built this platform together — and, most importantly, the friendship we’ve built along the way. That’s for life.

Until next time 👋🏽
