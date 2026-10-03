'use client'

import { ChevronDown, LoaderCircle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { RelativeTime } from '@/components/shared/relative-time'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { entriesConfig } from '@/lib/config'
import {
  type EntryField,
  formatEntryValue,
  otherFieldKeys,
  spamCheckState,
  spamLikelihood,
} from '@/lib/entries/entries'
import type { FormEntry } from '@/types/models'

const utc = (datetime: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(datetime))

const local = (datetime: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(datetime),
  )

/**
 * Everything recorded for one entry. Entry data comes from anonymous submitters, so every value
 * is rendered as text through React's escaping: no HTML, no Markdown and no links, not even for
 * the referer.
 */
export function EntryDetail({
  entry,
  fields,
  now,
}: {
  entry: FormEntry
  fields: readonly EntryField[]
  now: number
}) {
  const otherKeys = otherFieldKeys(entry.input, fields)
  const checkState = spamCheckState(entry, now, entriesConfig.spamCheckWindowMs)
  const likelihood = spamLikelihood(entry)
  const userAgent = entry.user_agent_display
  // The Backend parses the user agent in the background, alongside the spam check.
  const parsingUserAgent =
    !userAgent &&
    Boolean(entry.user_agent) &&
    now - Date.parse(entry.created_at ?? '') < entriesConfig.spamCheckWindowMs
  const ips = (entry.ip ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
  const value = (key: string) => formatEntryValue(entry.input?.[key])

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="entry-fields">
        <h3 id="entry-fields" className="sr-only">
          Submitted fields
        </h3>
        <dl className="flex flex-col gap-4">
          {fields.map((field) => (
            <div key={field.key}>
              <dt className="text-sm font-medium text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 break-words whitespace-pre-wrap">
                {value(field.key) || <span className="text-muted-foreground">—</span>}
              </dd>
            </div>
          ))}
        </dl>
        {fields.length === 0 && otherKeys.length === 0 && (
          <p className="text-sm text-muted-foreground">This entry has no submitted values.</p>
        )}
      </section>

      {otherKeys.length > 0 && (
        <section aria-labelledby="entry-other" className="flex flex-col gap-3">
          <div>
            <h3 id="entry-other" className="text-sm font-semibold">
              Other fields
            </h3>
            <p className="text-sm text-muted-foreground">
              Submitted under names the form&apos;s fields no longer use.
            </p>
          </div>
          <dl className="flex flex-col gap-3">
            {otherKeys.map((key) => (
              <div key={key}>
                <dt className="font-mono text-sm text-muted-foreground">{key}</dt>
                <dd className="mt-1 break-words whitespace-pre-wrap">{value(key) || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby="entry-spam" className="flex flex-col gap-2">
        <h3 id="entry-spam" className="text-sm font-semibold">
          Spam check
        </h3>

        {checkState === 'checking' ? (
          <Alert>
            <LoaderCircle aria-hidden className="animate-spin" />
            <AlertTitle>Checking for spam…</AlertTitle>
            <AlertDescription>
              This entry may still move to Spam. Alerts go out once the check finishes.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {entry.spam ? (
                <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                  <ShieldAlert aria-hidden />
                  Spam
                </Badge>
              ) : (
                <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck aria-hidden />
                  Not spam
                </Badge>
              )}
              {likelihood !== null && <span className="text-sm">{likelihood}% likely spam</span>}
              {checkState === 'unchecked' && (
                <span className="text-sm text-muted-foreground">Not checked for spam</span>
              )}
            </div>
            {entry.spam_checked_at && (
              <p className="text-sm text-muted-foreground">
                Checked <RelativeTime datetime={entry.spam_checked_at} />
              </p>
            )}
            {entry.spam_reason && (
              <p className="text-sm break-words text-muted-foreground">{entry.spam_reason}</p>
            )}
            {checkState === 'unchecked' && (
              <p className="text-sm text-muted-foreground">
                The spam check couldn&apos;t run, so this entry stayed in the Inbox and its alerts
                were sent.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="entry-meta" className="flex flex-col gap-3">
        <h3 id="entry-meta" className="text-sm font-semibold">
          Submission
        </h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Received</dt>
          <dd>
            {entry.created_at && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <time dateTime={entry.created_at} tabIndex={0} suppressHydrationWarning>
                    {local(entry.created_at)}
                  </time>
                </TooltipTrigger>
                <TooltipContent>{utc(entry.created_at)}</TooltipContent>
              </Tooltip>
            )}
          </dd>

          <dt className="text-muted-foreground">
            {ips.length > 1 ? 'IP addresses' : 'IP address'}
          </dt>
          <dd className="font-mono break-all">{ips.join(', ') || '—'}</dd>

          {entry.ip_location_display && (
            <>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{entry.ip_location_display}</dd>
            </>
          )}

          <dt className="text-muted-foreground">Referer</dt>
          <dd className="break-all">{entry.referer || '—'}</dd>

          <dt className="text-muted-foreground">Device</dt>
          <dd>
            {userAgent ? (
              `${userAgent.browser ?? 'Unknown browser'}${userAgent.browser_version ? ` ${userAgent.browser_version}` : ''} on ${userAgent.platform ?? 'an unknown platform'}`
            ) : parsingUserAgent ? (
              <span className="text-muted-foreground">Parsing…</span>
            ) : entry.user_agent ? (
              <span className="text-muted-foreground">Not recognised</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </dl>

        {entry.user_agent && (
          <Collapsible className="text-sm">
            <CollapsibleTrigger className="group flex items-center gap-1 text-primary hover:underline">
              Raw user agent
              <ChevronDown
                aria-hidden
                className="size-4 transition-transform group-data-[state=open]:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                {entry.user_agent}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </section>
    </div>
  )
}
