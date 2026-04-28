import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, CalendarPlus, ArrowLeftRight, Rss, Smartphone } from "lucide-react";

function Section({ icon: Icon, title, children }: any) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2 text-muted-foreground leading-relaxed">
        {children}
      </CardContent>
    </Card>
  );
}

export default function InstructionsPage() {
  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> How this works
        </h1>
        <p className="text-sm text-muted-foreground">Quick reference for providers and admins.</p>
      </div>

      <Section icon={CalendarPlus} title="Building the schedule (admin)">
        <p>Open <span className="text-foreground font-medium">Build schedule</span>. You'll see a week grid with a row for each call pool.</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Use the week arrows to navigate. "This week" snaps back to today.</li>
          <li>In any empty cell, click the dropdown and pick a provider. The app generates the shift window automatically:
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li>Weekday pools (Lakeshore, MIENT GR, GRENT, PA) → Mon 8a – Tue 8a, and so on through Wed 8a – Thu 8a.</li>
              <li>Thursday weekday shift → Thu 8a – Fri 5p (hands off to weekend).</li>
              <li>Weekend pool → Fri 5p – Mon 8a, including Trinity Health GR ER.</li>
            </ul>
          </li>
          <li>To reassign, change the provider in the cell's dropdown. To remove, click the trash icon.</li>
          <li>Lakeshore weekday shifts default to Trinity Health Grand Haven as the location. Corewell and Peds ENT backup assignments accept free-form daily slots.</li>
        </ol>
      </Section>

      <Section icon={ArrowLeftRight} title="Requesting a call swap">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Go to <span className="text-foreground font-medium">Swaps</span> → "Request swap".</li>
          <li>Pick one of your upcoming shifts, then the colleague you're asking to cover.</li>
          <li>Add an optional reason. The request shows up in their queue.</li>
          <li>The target provider (or an admin) approves or declines. Approved swaps reassign the shift immediately — subscribed calendars update on their next refresh.</li>
          <li>Every swap is recorded in the audit log. Admins can override assignments directly from the Build schedule view.</li>
        </ol>
      </Section>

      <Section icon={Rss} title="Syncing to your phone / computer calendar">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Open <span className="text-foreground font-medium">Calendar feeds</span> and copy your personal feed URL.</li>
          <li>In Apple Calendar: File → New Calendar Subscription → paste → Subscribe. On iOS: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.</li>
          <li>In Google Calendar: Other calendars → + → From URL.</li>
          <li>In Outlook: Add calendar → Subscribe from web.</li>
        </ol>
        <p>Tip: each pool has its own feed URL, so the office manager or answering service can subscribe to "Weekend" alone.</p>
      </Section>

      <Section icon={Smartphone} title="Installing as an app">
        <p>Open the site in Safari (iOS/macOS) or Chrome/Edge (Windows) and choose "Add to Home Screen" / "Install app". It behaves like a native app afterward — full-screen, home-screen icon, instant launch.</p>
      </Section>

      <Section icon={BookOpen} title="Pool quick reference">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="text-foreground"><span className="font-medium">Lakeshore:</span> Orton, Palmer, Strabbing, Kennan — Trinity Health Grand Haven.</div>
          <div className="text-foreground"><span className="font-medium">MIENT GR:</span> Foster, Howard, Riley, Cameron, Shah-Becker.</div>
          <div className="text-foreground"><span className="font-medium">GRENT:</span> Artz, Taylor, Cox, Mistry, Bueller.</div>
          <div className="text-foreground"><span className="font-medium">Weekend (shared):</span> Fri 5p – Mon 8a, plus Trinity Health GR ER.</div>
          <div className="text-foreground"><span className="font-medium">PA pool:</span> Ophoff, Kuipers, Rogie, Wight, King, Luddington. Covers Lakeshore + MIENT patients.</div>
          <div className="text-foreground"><span className="font-medium">Corewell / Peds backup:</span> Shah-Becker, adult + pediatric coverage.</div>
        </div>
      </Section>
    </div>
  );
}
