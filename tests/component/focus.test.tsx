import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DataTable, dataTableColumns } from '../../components/shared/data-table'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog'

interface Row {
  id: string
  count: number
}

/** Builds its columns during every render, as the Entries and Exports tables do. */
function Counter() {
  const [rows, setRows] = useState<Row[]>([{ id: 'a', count: 0 }])
  const column = dataTableColumns<Row>()
  const columns = column.columns([
    column.display({
      id: 'count',
      header: 'Count',
      cell: ({ row }) => (
        <Button onClick={() => setRows([{ id: 'a', count: row.original.count + 1 }])}>
          Clicked {row.original.count}
        </Button>
      ),
    }),
  ])

  return <DataTable caption="Counts" columns={columns} data={rows} getRowId={(row) => row.id} />
}

describe('DataTable', () => {
  it('keeps focus on a cell control when the table re-renders with new columns', async () => {
    const user = userEvent.setup()

    render(<Counter />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Clicked 0' })).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Clicked 1' })).toHaveFocus()
  })
})

/** A dialog opened from state, with no DialogTrigger, like the recipient and confirm dialogs. */
function StateDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Settings</DialogTitle>
          <input aria-label="Name" />
        </DialogContent>
      </Dialog>
    </>
  )
}

describe('DialogContent', () => {
  it('returns focus to what opened it, even without a trigger', async () => {
    const user = userEvent.setup()

    render(<StateDialog />)
    await user.tab()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
    )

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus())
  })
})
