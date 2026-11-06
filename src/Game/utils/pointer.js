// Pointer capture keeps a drag alive outside the element; it throws if the
// pointer is already gone, which must not break the control
export function capturePointer(element, pointerId) {
    try {
        element.setPointerCapture(pointerId)
    } catch {
        // Pointer already released
    }
}
