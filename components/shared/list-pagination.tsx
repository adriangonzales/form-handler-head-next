'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { pageSizes } from '@/lib/list-query'
import type { Paginated } from '@/types/models'

/**
 * Rows-per-page choice, the range shown, and previous/next page buttons. Lists with a fixed page
 * size leave out `onPerPageChange`, and get no rows-per-page choice.
 */
export function ListPagination({
  meta,
  perPage,
  onPageChange,
  onPerPageChange,
}: {
  meta: Paginated<unknown>['meta']
  perPage?: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
}) {
  const { current_page: page, last_page: lastPage, from, to, total } = meta

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <div className="flex items-center gap-2">
        {onPerPageChange && (
          <>
            <span id="rows-per-page">Rows per page</span>
            <Select
              value={String(perPage)}
              onValueChange={(value) => onPerPageChange(Number(value))}
            >
              <SelectTrigger size="sm" aria-labelledby="rows-per-page" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <span className="tabular-nums">
          {from ?? 0}–{to ?? 0} of {total}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          Page {page} of {lastPage}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
