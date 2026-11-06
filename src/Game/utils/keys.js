// Readable name of a KeyboardEvent.code, for menus and on-screen hints
const NAMES = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift D',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl D',
    AltLeft: 'Alt',
    AltRight: 'Alt Gr',
    MetaLeft: 'Win',
    MetaRight: 'Win D',
    Space: 'Espacio',
    Enter: 'Enter',
    NumpadEnter: 'Enter (num)',
    Escape: 'Esc',
    Tab: 'Tab',
    Backspace: 'Borrar',
    Delete: 'Supr',
    CapsLock: 'Bloq Mayús',
    Semicolon: 'Ñ',
    Comma: ',',
    Period: '.',
    Slash: '-',
    Minus: "'",
    Equal: '¿',
    BracketLeft: '`',
    BracketRight: '+',
    Backquote: 'º',
    Quote: '´',
    Backslash: 'Ç',
    IntlBackslash: '<'
}

export function keyLabel(code) {
    if (!code) return '—'
    if (NAMES[code]) return NAMES[code]
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ')
}
