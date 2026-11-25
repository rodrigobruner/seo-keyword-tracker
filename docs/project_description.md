# Project description

Build a small SEO keyword tracker that crawls a client website, works out what each page probably ranks for, and
tracks those positions over time. 

## What you are building

A keyword tracker for a marketing agency. An agency user signs in and sees the pages of their client's website, each
with the keywords that page is likely to rank for and its latest position. They can open a page to see how its positions
moved over time, and point the crawler at a new URL to pull it in.

### Stack:

Database
PostgreSQL. Required, not negotiable.
Backend
Node with TypeScript. Express, Fastify or NestJS, your choice.
Frontend
React or Next.js. Server rendered or client rendered, your choice.
Crawling
Any HTTP client and HTML parser you like. No need to hand-roll either.
Styling
Plain CSS, Tailwind, or a component library, your choice.
AI tools
Use them. Claude Code, Cursor, Codex, whatever you normally use.
Use AI freely. We assume you will, and we work the same way. Tell us in the README which tools you used.

## The data

You design the schema. We are not giving you one, and how you model this is part of what we are looking at.
The domain has six things in it: users, clients, pages, keywords, SEO issues, and rank snapshots. A client belongs to
one agency user and has a website URL. A page is one URL on that website. A keyword is a search term a page is
likely to rank for. An SEO issue is a problem found on a page. A rank snapshot records the position of one page for
one keyword on one date.
Positions are invented. Nothing in this app talks to Google and there is no real rank checking to build. Your seed script
makes the position numbers up.
The pages and keywords are not invented. They come from the live website.
Write a seed script, committed to the repo, that does the following:
 Creates 2 users, each with one client. One client's website is https://www.semrush.com, the other's is
https://yoast.com.
 For each client, finds that site's blog sitemap from the website URL alone, takes the first 15 blog posts in the order
the sitemap lists them, and fetches each one. Nothing about either site may be hardcoded. The same code has
to work for a website URL it has never seen.
 For each page, works out two things from the page itself: the keywords it is likely to rank for, and the SEO issues it
has. The logic for both is yours to decide. There is no answer key and we are not going to give you one.
 Generates daily rank positions for every page and keyword pair, over a long enough history that the snapshots
table ends up holding at least 50,000 rows.
The app needs to stay responsive with that much data in the database.
Snapshots are stored in UTC. The person using the app is in Toronto.


## Requirements

Four screens.

### 1. Sign in

Email and password. Sessions persist across a page refresh. Everything below sits behind the login.

### 2. Pages list

Shows the crawled pages belonging to the signed-in user, each with the keywords it is likely to rank for, how many
SEO issues it has, and its most recent position.
 Filter by client
 Search by URL or keyword
 Paginate, the list is longer than one screen
 A signed-in user sees their own clients and nothing else. User A must not be able to reach User B's data by any
route, including by changing an id in the URL.

### 3. Page detail

One page, its keywords, the SEO issues found on it, and the position history for those keywords over a date range the
user picks. A table or a chart, your choice.

### 4. Add a client

Enter a client name and a website URL. The app finds that site's sitemap, crawls its first 15 blog posts, and runs the
same keyword and issue logic the seed does. Any website URL has to work, not just the two in the seed.
 Reject anything that is not a valid URL
 The same website cannot be added twice by the same user
 The new client belongs to the signed-in user, and only to them
 A crawl of 15 pages takes time to finish
 Not every site has a sitemap where you expect one
 The new pages have no rank snapshots until the seed runs again

## README

One page in the repo root, no longer.
Three things:

### 1. How to run it. The exact commands, in order, from a clean clone to a working app with the seed loaded.


### 2. The decisions you made, and why. Whatever you think is worth explaining about how you built it.


### 3. Anything you left unfinished, and what you would do next.

Also name the AI tools you used and roughly what you used them for.


## How to submit

Push the project to a public GitHub repository and send us the link. That is the whole submission, nothing by email or
zip.
A few things we ask:
 Commit as you go, rather than squashing the whole project into one commit at the end.
 No secrets in the repo. Use a .env.example with placeholder values and keep the real .env out of version control.
 It has to run. We will clone it and follow your README, so test your own instructions on a clean clone before you
send the link.
If anything here is unclear, ask. If you run out of time, push what you have and note in the README what is
unfinished.
After we have read the repo we will book 25 minutes with you to talk it through.
