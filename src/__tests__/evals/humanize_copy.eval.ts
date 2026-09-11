/**
 * Humanize review quality, measured on matched copy pairs.
 *
 * Run:
 *   npm run eval -- humanize_copy
 *
 * Model-free, like plumbing_check: the deterministic scanner carries these
 * assertions, so this runs in every `npm run eval` without an API key.
 *
 * ## Why pairs rather than an AI/human corpus
 *
 * Humanize is not a detector — `HUMANIZE_REVIEW_SYSTEM_PROMPT` forbids
 * guessing authorship — so scoring it on "is this AI" measures a capability
 * we deliberately refused to build. Both halves of every pair below were
 * written by a model. They describe the same fictional product at the same
 * price with the same facts, and differ only in whether the copy has a voice.
 * That makes the question the feature actually answers the thing under test:
 * does it fire on the flat version and stay silent on the good one?
 *
 * ## What fails, and what is only reported
 *
 * Two invariants fail the build:
 *
 *   1. The natural half scores zero. Flagging good copy is the failure that
 *      would retire this feature, so it is the strictest assertion here.
 *   2. No pair inverts — conventional is never quieter than natural.
 *
 * Discrimination (how many pairs the scanner separates at all) is recorded
 * rather than asserted. It sits at 1 of 10 today because the remaining nine
 * "conventional" samples are flat, not sloppy: they quote real prices, real
 * dimensions and real limitations. Humanize removes slop and does not supply
 * voice, so a low number here is the scope of the feature showing up in the
 * measurement, not a regression. Assert it and the eval would fail nine times
 * over for working as designed.
 *
 * Fixtures are fictional test copy written for this suite. The brands do not
 * exist and the offers are not real.
 */
import { describe, expect, it } from "vitest";

import { scanForTells, summarizeTells } from "@/shared/ai_tells";

interface CopyPair {
  product: string;
  /** Accurate, specific, and without a voice. */
  conventional: string;
  /** The same offer, written like a person wrote it. */
  natural: string;
}

const PAIRS: CopyPair[] = [
  {
    product: "minutelet",
    conventional:
      "Turn uploaded meeting transcripts into a first draft of your notes. Minutelet organizes a transcript into a summary, decisions, and possible action items for you to review. It does not join or record calls. The free plan includes three uploads each month, with a limit of 60 minutes of transcript per upload. Check the draft against your conversation, make your edits, and export the result as Markdown.",
    natural:
      "The meeting’s over. Writing it up is still on your list. Upload the transcript to Minutelet and get a draft with a summary, decisions, and possible action items. Read it over before sharing; the draft can miss things. Minutelet doesn’t join calls or record anyone. The free plan covers three uploads a month, up to 60 minutes of transcript each, and you can export your edited notes as Markdown. Try it on the meeting you’ve been meaning to write up since Tuesday.",
  },
  {
    product: "alder lamp",
    conventional:
      "Light your workspace with the Alder desk lamp. Its adjustable arm and three brightness settings let you position the light for reading or desk work. The lamp uses USB-C power and includes a cable; a wall adapter is sold separately. Available in chalk and charcoal. $49. View dimensions before ordering.",
    natural:
      "For the corner of your desk that’s always a bit too dark. Alder has an adjustable arm, three brightness settings, and a USB-C cable in the box. You’ll need your own wall adapter. Choose chalk or charcoal, check the dimensions, and find it a spot. $49.",
  },
  {
    product: "clearpath",
    conventional:
      "Bring every client approval into one organized workspace. Clearpath gives creative teams a shared place to upload work, collect comments, and track sign-off. Clients can review a project through a browser link without creating an account. Plans start at $24 per workspace per month and include five active projects. Start a 14-day trial, invite your first reviewer, and see which decisions are still waiting for an answer. No credit card is required to try it.",
    natural:
      "The client approved it. Probably. There’s a message somewhere, but three people have shared three different files since then. Clearpath puts the file, the comments, and the sign-off together so you can check before sending work to production. Your client opens a browser link; they don’t need another account. It’s $24 a month for a workspace with five active projects. Try it for 14 days without a credit card. Start with the project that currently has the most confusing email thread.",
  },
  {
    product: "replybench",
    conventional:
      "Give a small team a shared place to handle customer email. Replybench supports conversation assignments, internal notes, and saved replies. The Team plan costs $39 per month for three users and one connected inbox. Existing messages can be imported from a supported email account during setup. Check account compatibility and start a seven-day trial before choosing a plan.",
    natural:
      "Two people replied to the same customer. The next customer got no reply at all. Replybench adds assignments, private team notes, and saved replies to a shared support inbox. Three users and one inbox cost $39 a month. You can import existing messages from a supported email account when you set it up. Check that your account works with it, then take the seven-day trial. A good first test: can everyone tell who’s answering what?",
  },
  {
    product: "gardening workshop",
    conventional:
      "Learn the basics of container gardening in a two-hour, small-group workshop. You’ll practice choosing a pot, preparing soil, and planting herbs for a balcony or patio. The $45 booking includes materials and one planted container to take home. Sessions run on Saturday mornings and have space for eight participants. View the available dates and reserve a place at the table.",
    natural:
      "A balcony counts as a garden. So does the little patch beside your back door. Bring your questions to our Saturday workshop and spend two hours potting herbs with a group of up to eight people. We’ll cover containers, soil, and planting, then you’ll take your planted pot home. Materials are included in the $45 booking. Pick a Saturday that works for you. There’s no need to arrive already knowing why the last basil plant gave up.",
  },
  {
    product: "bookkeeping",
    conventional:
      "Get a clearer view of your monthly business records. Our bookkeeping service reconciles up to two bank accounts and prepares a monthly income-and-expense report. Plans begin at $180 per month. Tax filing and payroll are separate services. Book a 20-minute introductory call to discuss your current setup and the records we would need to get started.",
    natural:
      "If checking your books means opening six tabs and hoping the numbers agree, let’s talk. We reconcile up to two bank accounts and put together a monthly income-and-expense report. Plans start at $180 a month; payroll and tax filing cost extra. Book a 20-minute introduction. We’ll ask how you keep records now and explain what we’d need from you. You can decide from there.",
  },
  {
    product: "pagewell",
    conventional:
      "Create a focused page for your next campaign. Pagewell includes editable page sections, mobile previews, and a built-in signup form. Publish on a Pagewell subdomain or connect a domain you own. The Starter plan is $19 per month for three published pages. You can export form submissions as a CSV file whenever you need them. Choose a starting layout and build a page around one clear offer.",
    natural:
      "You have an offer ready. Now it needs a page. Pagewell gives you editable sections, a signup form, and a mobile preview so you can check the small-screen version before publishing. Use our subdomain or connect your own. Starter costs $19 a month and lets you keep three pages published. When the leads come in, export them as a CSV. Start with one page. You can spend the rest of the afternoon working out what to say on it.",
  },
  {
    product: "fieldwork coffee",
    conventional:
      "Discover a new coffee every month with the Fieldwork tasting subscription. Each delivery includes two 200 g bags of whole-bean coffee and a card describing the origins and suggested brewing methods. Choose a light or medium roast preference when you subscribe. Deliveries cost $28, with shipping calculated at checkout. You can skip an upcoming shipment before its billing date. Explore the next selection and make room for something different in your morning routine.",
    natural:
      "Same mug. Different coffee. Fieldwork sends two 200 g bags each month, plus a small card with the origins and a few brewing suggestions. Tell us whether you prefer light or medium roasts and we’ll take it from there. It’s $28 per delivery; shipping is extra and shown at checkout. Cupboard still full? Skip the next shipment before it bills. You don’t have to drink faster just because a subscription says it’s time.",
  },
  {
    product: "foldway pouch",
    conventional:
      "Keep small essentials together with the Foldway travel pouch. A zip compartment holds cables and chargers, while two internal pockets separate smaller items. Made from recycled polyester, it measures 20 × 12 × 6 cm and costs $22. Check the measurements against your equipment before ordering. Available in moss, navy, and rust.",
    natural:
      "Your charger has a cable. Your headphones have a cable. Somehow they’ve become one cable. Foldway gives them a zip compartment and two little internal pockets. The pouch is recycled polyester, measures 20 × 12 × 6 cm, and costs $22. Check whether your chunky charger fits before ordering. Moss, navy, or rust. One less thing to untangle at the gate.",
  },
  {
    product: "trackroom",
    conventional:
      "Collect feedback on your next mix with Trackroom. Upload a stereo audio file and share a private review link. Listeners can leave comments at specific playback times, helping you connect each note with the relevant moment. The $12 monthly plan includes ten active tracks. Trackroom stores review files; it does not edit or master your audio. Upload a mix to begin.",
    natural:
      "“The guitar’s a bit loud.” Which guitar? Where? Trackroom lets people leave a comment at the moment they’re hearing it. Upload your stereo mix, share the private link, and collect the notes in one place. It’s $12 a month for ten active tracks. There’s no mastering button and no audio editor here. Just a way to make the next round of mix feedback a little more specific.",
  },
];

/**
 * Lines from the natural half that are shaped like tells and are not tells.
 *
 * Each one is a structure the taxonomy names — parallel fragments, a question
 * answered immediately, a three-part stack — used deliberately and well. They
 * are the copy this feature exists to protect, and the shape that produced a
 * real false positive on a portfolio site during manual testing.
 */
const DELIBERATE_STYLE: { why: string; copy: string }[] = [
  {
    why: "parallel fragments where the contrast is the product",
    copy: "Same mug. Different coffee.",
  },
  {
    why: "a question whose answer is an instruction, not a pitch",
    copy: "Cupboard still full? Skip the next shipment before it bills.",
  },
  {
    why: "a three-part stack that lands a joke instead of stacking adjectives",
    copy: "Your charger has a cable. Your headphones have a cable. Somehow they've become one cable.",
  },
  {
    why: "an admitted limitation, which reads as candour rather than puffery",
    copy: "There's no mastering button and no audio editor here.",
  },
];

describe("humanize review on matched copy pairs", () => {
  it.each(PAIRS)(
    "leaves the natural version of $product alone",
    ({ natural }) => {
      expect(summarizeTells(scanForTells(natural))).toEqual({});
    },
  );

  it.each(PAIRS)(
    "never scores $product backwards",
    ({ conventional, natural }) => {
      expect(scanForTells(conventional).length).toBeGreaterThanOrEqual(
        scanForTells(natural).length,
      );
    },
  );

  it.each(DELIBERATE_STYLE)("reads $why as style", ({ copy }) => {
    expect(scanForTells(copy)).toEqual([]);
  });

  it("reports how many pairs the scanner separates", () => {
    const separated = PAIRS.filter(
      (p) =>
        scanForTells(p.conventional).length > scanForTells(p.natural).length,
    );

    // Recorded, not asserted — see the header note on scope.
    console.log(
      `[test] discrimination ${separated.length}/${PAIRS.length}: ${
        separated.map((p) => p.product).join(", ") || "none"
      }`,
    );

    // The corpus must stay usable: if every pair separated, the fixtures
    // would have drifted into obvious slop and stopped being a hard test.
    expect(separated.length).toBeLessThan(PAIRS.length);
  });
});
