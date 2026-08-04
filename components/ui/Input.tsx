import { cn } from '@/lib/utils'
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react'

/**
 * Form controls at the design's sizes.
 *
 * `md` (38px) is the default and covers the personal-information grid; `lg`
 * (40px) is the loan-details grid and the dialogs; `xl` (44px) is the Remove
 * Record search bar, which is deliberately the largest field in the app because
 * it is the one a shopkeeper hits first with a customer waiting.
 */
type FieldSize = 'mini' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<FieldSize, string> = {
  mini: 'input-mini',
  md:   'input',
  lg:   'input-lg',
  xl:   'input-xl',
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helper?: string
  fieldSize?: FieldSize
  /** Renders "(optional)" beside the label, as the design does. */
  optional?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, className, id, fieldSize = 'md', optional, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
            {props.required && <span className="ml-0.5 text-red">*</span>}
            {optional && <span className="label-optional"> (optional)</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(SIZE_CLASS[fieldSize], error && 'input-error', className)}
          {...props}
        />
        {error  && <p className="error-msg">{error}</p>}
        {helper && !error && <p className="mt-1 text-11.5 text-ink-faint">{helper}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helper?: string
  optional?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helper, className, id, optional, ...props }, ref) => {
    const fieldId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="label">
            {label}
            {props.required && <span className="ml-0.5 text-red">*</span>}
            {optional && <span className="label-optional"> (optional)</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          className={cn('textarea', error && 'input-error', className)}
          {...props}
        />
        {error  && <p className="error-msg">{error}</p>}
        {helper && !error && <p className="mt-1 text-11.5 text-ink-faint">{helper}</p>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  fieldSize?: 'mini' | 'md'
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, fieldSize = 'md', children, ...props }, ref) => {
    const fieldId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && <label htmlFor={fieldId} className="label">{label}</label>}
        <select
          ref={ref}
          id={fieldId}
          className={cn(
            fieldSize === 'mini' ? 'select-mini' : 'select',
            'w-full',
            error && 'input-error',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="error-msg">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'
