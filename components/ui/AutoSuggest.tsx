'use client'
/**
 * Text input that suggests values already used in this shop's records.
 *
 * Shops re-lend to the same families for years, and the same handful of
 * localities, over and over. Without this, "Sadar Bazaar" drifts into "sadar
 * bazar" and "Sadar Bazzar" across years of typing — which is exactly what
 * makes location reports useless. Suggestions are ordered by how often each
 * value has been used, so the common ones surface first.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { CornerDownLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { memoryCached } from '@/lib/memory-cache'

type Field = 'name' | 'father_name' | 'location' | 'detailed_type'

interface Props {
  field: Field
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  error?: string
  helper?: string
  name?: string
  id?: string
  inputClassName?: string
  ariaLabel?: string
  showCompletionHint?: boolean
}

interface Suggestion { value: string; uses: number }

export function AutoSuggest({
  field, label, value, onChange, placeholder, required, error, helper, name, id,
  inputClassName, ariaLabel, showCompletionHint = true,
}: Props) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputId = id ?? name ?? field
  const listId = `${inputId}-suggestions`

  const fetchSuggestions = useCallback(async (prefix: string) => {
    const normalized = prefix.trim().toLocaleLowerCase('en-IN')
    setLoading(true)
    try {
      const suggestions = await memoryCached<Suggestion[]>(
        `field-suggestions:${field}:${normalized}`,
        120_000,
        async () => {
          const supabase = createClient()
          const { data, error } = await supabase.rpc('field_suggestions', {
            p_field: field,
            p_prefix: prefix,
            p_limit: 8,
          })
          if (error) throw error
          return (data as Suggestion[]) ?? []
        }
      ).catch(() => [])
      setItems(suggestions)
    } finally {
      setLoading(false)
    }
  }, [field])

  // Debounced: this fires on every keystroke at a busy counter, and each one
  // is a database round trip.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => fetchSuggestions(value.trim()), 180)
    return () => clearTimeout(t)
  }, [value, open, fetchSuggestions])

  // Close when focus leaves the whole control, not just the input — clicking a
  // suggestion blurs the input and would otherwise dismiss the list first.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false); setActive(-1)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const completion = items.find(item =>
      value.trim().length > 0
      && item.value.toLocaleLowerCase('en-IN').startsWith(value.toLocaleLowerCase('en-IN'))
      && item.value.toLocaleLowerCase('en-IN') !== value.trim().toLocaleLowerCase('en-IN')
    )
    const caretAtEnd = e.currentTarget.selectionStart === value.length
    if (completion && caretAtEnd && (e.key === 'Tab' || e.key === 'ArrowRight')) {
      e.preventDefault(); choose(completion.value); return
    }
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setActive(i => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActive(i => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      // Only swallow Enter when a suggestion is highlighted, so the form can
      // still be submitted from the field normally.
      e.preventDefault(); choose(items[active].value)
    } else if (e.key === 'Escape') {
      setOpen(false); setActive(-1)
    }
  }

  const visible = items.filter(
    i => i.value.toLowerCase() !== value.trim().toLowerCase()
  )
  const completion = visible.find(i =>
    value.trim().length > 0
    && i.value.toLocaleLowerCase('en-IN').startsWith(value.toLocaleLowerCase('en-IN'))
  )
  const completionSuffix = completion?.value.slice(value.length) ?? ''

  return (
    <div className="w-full relative" ref={boxRef}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative rounded-lg bg-white">
        {completionSuffix && (
          <div
            className="pointer-events-none absolute inset-0 flex h-10 items-center overflow-hidden whitespace-pre px-3 text-sm"
            aria-hidden
          >
            <span className="invisible">{value}</span>
            <span className="text-slate-400">{completionSuffix}</span>
          </div>
        )}
        <input
          id={inputId}
          name={name}
          aria-label={ariaLabel}
          className={cn('input completion-input relative', loading && 'pr-9', error && 'input-error', inputClassName)}
          value={value}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open && visible.length > 0}
          aria-autocomplete="both"
          onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
          onFocus={() => { setOpen(true); fetchSuggestions(value.trim()) }}
          onKeyDown={onKeyDown}
        />
        {loading && <Loader2 className="pointer-events-none absolute right-3 top-3 h-4 w-4 animate-spin text-primary-500" aria-hidden />}
      </div>

      {open && visible.length > 0 && (
        <ul id={listId} className="suggest-panel" role="listbox">
          {visible.map((s, i) => (
            <li key={s.value}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={cn('suggest-item', i === active && 'suggest-item-active')}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s.value)}
              >
                <span className="truncate">{s.value}</span>
                <span className="shrink-0 text-[10px] font-medium text-slate-400">used {s.uses}×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCompletionHint && completionSuffix && !error && !helper && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
          <CornerDownLeft className="h-3 w-3" /> Tab or → to complete
        </p>
      )}

      {error  && <p className="error-msg">{error}</p>}
      {helper && !error && <p className="text-xs text-slate-500 mt-1">{helper}</p>}
    </div>
  )
}
