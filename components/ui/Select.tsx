import { cn } from '@/lib/utils'
import { forwardRef, type SelectHTMLAttributes } from 'react'

/**
 * A labelled dropdown at the design's field heights: 40px inside a form grid,
 * 36px in a toolbar, 32px on a settings row.
 */
type FieldSize = 'mini' | 'md' | 'lg'

const SIZE_CLASS: Record<FieldSize, string> = {
  mini: 'select-mini w-full',
  md:   'select w-full',
  lg:   'select h-10 w-full',
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
  fieldSize?: FieldSize
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, fieldSize = 'lg', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
            {props.required && <span className="ml-0.5 text-red">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(SIZE_CLASS[fieldSize], error && 'input-error', className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {error && <p className="error-msg">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'
