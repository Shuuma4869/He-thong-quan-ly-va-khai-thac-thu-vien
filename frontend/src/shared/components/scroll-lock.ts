const locks = new WeakMap<HTMLElement, { count: number; overflow: string }>();

// Chỉ trả quyền cuộn khi lớp phủ cuối cùng đã đóng, bất kể thứ tự unmount.
export function lockBodyScroll() {
  const body = document.body;
  const state = locks.get(body) ?? { count: 0, overflow: body.style.overflow };
  state.count++;
  locks.set(body, state);
  body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.count === 0) {
      body.style.overflow = state.overflow;
      locks.delete(body);
    }
  };
}
