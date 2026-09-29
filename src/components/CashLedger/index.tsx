'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { CashTransactionType, PortfolioCashTransaction } from '@/core/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectControl, SelectOption } from '@/components/ui/select';
import './CashLedger.css';

export interface CashLedgerInput {
  type: CashTransactionType;
  amount: number;
  timestamp: number;
}

interface CashLedgerProps {
  portfolioId: number | null;
  transactions: PortfolioCashTransaction[];
  page: number;
  pageCount: number;
  total: number;
  busy: boolean;
  onSubmit: (entry: CashLedgerInput) => Promise<boolean>;
  onDelete: (entry: PortfolioCashTransaction) => Promise<void>;
  onPageChange: (page: number) => void;
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });

function getDateTimeLocalValue(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Index({ portfolioId, transactions, page, pageCount, total, busy, onSubmit, onDelete, onPageChange }: CashLedgerProps): React.JSX.Element {
  const [type, setType] = useState<CashTransactionType>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [cashTime, setCashTime] = useState(getDateTimeLocalValue);

  async function submitEntry(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!portfolioId) return;
    const saved = await onSubmit({ type, amount: Number(amount), timestamp: cashTime ? new Date(cashTime).getTime() : Date.now() });
    if (!saved) return;
    setAmount('');
    setCashTime(getDateTimeLocalValue());
  }

  return <Card className="cash-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">CASH LEDGER</p><CardTitle>Deposits &amp; withdrawals</CardTitle><CardDescription>Cash entries and trades combine to calculate total portfolio value. Use past dates to capture existing account cash flows.</CardDescription></div></CardHeader><CardContent>
    <form onSubmit={(event) => void submitEntry(event)}>
      <div className="cash-form">
        <div className="cash-form-row">
          <label>TYPE<SelectControl value={type} displayValue={type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} ariaLabel="Cash entry type" onValueChange={(value) => setType(value as CashTransactionType)}><SelectOption value="DEPOSIT">Deposit</SelectOption><SelectOption value="WITHDRAWAL">Withdrawal</SelectOption></SelectControl></label>
          <label>AMOUNT (AUD)<Input aria-label="Cash amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label>
        </div>
        <div className="cash-form-row">
          <div>
            <label>DATE / TIME<Input aria-label="Cash date and time" lang="en-GB" type="datetime-local" value={cashTime} onChange={(event) => setCashTime(event.target.value)}/></label>
          </div>
        </div>
        <div className="cash-form-actions">
          <Button type="submit" variant="default" disabled={busy || !portfolioId || !amount}>{busy ? 'Saving…' : 'Save cash entry'}</Button>
        </div>
      </div>
    </form>
    <div className="cash-history"><h4>Recent cash entries</h4>{transactions.length ? <><div className="cash-table">{transactions.map((entry) => <div className="cash-row" key={entry.id}><Badge variant={entry.type === 'DEPOSIT' ? 'success' : 'outline'}>{entry.type}</Badge><strong>{money.format(entry.amount)}</strong><small>{dateTime.format(entry.timestamp)}</small><Button variant="ghost" size="icon" className="cash-delete-button" aria-label={`Delete ${entry.type.toLowerCase()} of ${money.format(entry.amount)} on ${dateTime.format(entry.timestamp)}`} disabled={busy} onClick={() => void onDelete(entry)}><Trash2 className="size-4"/></Button></div>)}</div><div className="trade-pagination"><span>{(page - 1) * 6 + 1}–{Math.min(page * 6, total)} of {total}</span><div><Button variant="ghost" size="sm" aria-label="Previous cash page" disabled={busy || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}><ChevronLeft className="size-4"/>Previous</Button><span>Page {page} of {Math.max(pageCount, 1)}</span><Button variant="ghost" size="sm" aria-label="Next cash page" disabled={busy || page >= pageCount} onClick={() => onPageChange(page + 1)}>Next<ChevronRight className="size-4"/></Button></div></div></> : <div className="chart-empty">No cash entries recorded for this portfolio.</div>}</div>
  </CardContent></Card>;
}
