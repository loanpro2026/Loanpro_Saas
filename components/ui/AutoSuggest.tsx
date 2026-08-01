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
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

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
}

interface Suggestion { value: string; uses: number }

export function AutoSuggest({
  field, label, value, onChange, placeholder, required, error, helper, name, id,
}: Props) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputId = id ?? name ?? field

  const fetchSuggestions = useCallback(async (prefix: string) => {
    const supabase = createClient()
    const { data } = await supabase.rpc('field_suggestions', {
      p_field: field,
      p_prefix: prefix,
      p_limit: 8,
    })
    setItems((data as Suggestion[]) ?? [])
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

  const onKeyDown = (e: React.KeyboardEvent) => {
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

  return (
    <div className="w-full relative" ref={boxRef}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <input
        id={inputId}
        name={name}
        className={cn('input', error && 'input-error')}
        value={value}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && visible.length > 0}
        aria-autocomplete="list"
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => { setOpen(true); fetchSuggestions(value.trim()) }}
        onKeyDown={onKeyDown}
      />

      {open && visible.length > 0 && (
        <ul className="suggest-panel" role="listbox">
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
                <span className="text-xs text-slate-400 shrink-0">{s.uses}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error  && <p className="error-msg">{error}</p>}
      {helper && !error && <p className="text-xs text-slate-500 mt-1">{helper}</p>}
    </div>
  )
}
