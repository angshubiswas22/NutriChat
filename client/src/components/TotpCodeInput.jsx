import { useLayoutEffect, useRef, useState } from 'react';

function formatCode(digits) {
  return digits.length < 3
    ? digits
    : `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export default function TotpCodeInput({ id, value, onChange }) {
  const inputRef = useRef(null);
  const [selection, setSelection] = useState(null);

  useLayoutEffect(() => {
    if (selection) {
      inputRef.current?.setSelectionRange(
        selection.position,
        selection.position
      );
    }
  }, [selection]);

  function update(digits, digitsBeforeCursor) {
    const next = digits.slice(0, 6);
    const offset = Math.min(digitsBeforeCursor, next.length);
    onChange(next);
    setSelection({ position: offset + (offset >= 3 ? 1 : 0) });
  }

  function handleChange(event) {
    const text = event.target.value;
    const cursor = event.target.selectionStart ?? text.length;
    const digits = text.replace(/\D/g, '');
    const inputType = event.nativeEvent.inputType;

    // Handle deletion beside the separator on phone keyboards.
    if (digits === value && value.length >= 3 && cursor === 3) {
      if (inputType === 'deleteContentBackward') {
        update(value.slice(0, 2) + value.slice(3), 2);
        return;
      }
      if (inputType === 'deleteContentForward') {
        update(value.slice(0, 3) + value.slice(4), 3);
        return;
      }
    }

    const beforeCursor = text.slice(0, cursor).replace(/\D/g, '').length;
    update(digits, beforeCursor);
  }

  function handleKeyDown(event) {
    const input = event.currentTarget;
    const start = input.selectionStart;
    if (start == null || start !== input.selectionEnd) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

    // Prevent Backspace/Delete from getting stuck on the separator.
    if (event.key === 'Backspace' && input.value[start - 1] === '-') {
      event.preventDefault();
      update(value.slice(0, 2) + value.slice(3), 2);
    } else if (event.key === 'Delete' && input.value[start] === '-') {
      event.preventDefault();
      update(value.slice(0, 3) + value.slice(4), 3);
    }
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="Enter your 6 digit code here"
      pattern="[0-9]{3}-[0-9]{3}"
      title="Enter all six digits from your authenticator."
      required
      value={formatCode(value)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.08em',
      }}
    />
  );
}