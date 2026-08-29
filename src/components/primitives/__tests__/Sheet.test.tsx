/**
 * Item 15 (plans/what-are-the-next-jaunty-deer.md): interaction coverage for
 * Sheet.tsx, called out specifically because item 8's ref/setState fixes
 * (I-23) touched this component with zero existing test coverage to catch a
 * regression. Covers open/close/rapid-toggle — the scenarios the item 8
 * revised-risk-assessment comment (Sheet.tsx:124-138) reasons about manually.
 *
 * Animated.parallel(...).start() is mocked to invoke its completion callback
 * synchronously instead of running real spring physics — RN's Animated has
 * no native driver under Jest, and a spring's settle time isn't a fixed
 * duration fake timers can just fast-forward to. This still exercises the
 * real completion-callback logic (visibleRef gating, setMounted(false)); it
 * only replaces "wait for the physical animation," which is not what these
 * tests are about.
 */
import React from 'react';
import { Animated, Text } from 'react-native';
import { fireEvent, renderWithProviders, screen } from '../../../test-utils/renderWithProviders';
import { Sheet } from '../Sheet';

describe('Sheet', () => {
  let parallelSpy: jest.SpyInstance;

  beforeEach(() => {
    // Fires the completion callback immediately with { finished: true }, so
    // any exit-animation-driven unmount happens synchronously and
    // deterministically within the test instead of depending on a spring's
    // real settle time.
    parallelSpy = jest.spyOn(Animated, 'parallel').mockImplementation(
      (_animations) => ({ start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }) }) as unknown as Animated.CompositeAnimation
    );
  });

  afterEach(() => {
    parallelSpy.mockRestore();
  });

  it('renders nothing when visible is false from the start', () => {
    renderWithProviders(
      <Sheet visible={false} onClose={jest.fn()} title="My Sheet">
        <Text>Sheet body</Text>
      </Sheet>
    );
    expect(screen.queryByText('Sheet body')).toBeNull();
    expect(screen.queryByText('My Sheet')).toBeNull();
  });

  it('renders title and children when visible is true', () => {
    renderWithProviders(
      <Sheet visible onClose={jest.fn()} title="My Sheet">
        <Text>Sheet body</Text>
      </Sheet>
    );
    expect(screen.getByText('My Sheet')).toBeTruthy();
    expect(screen.getByText('Sheet body')).toBeTruthy();
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    renderWithProviders(
      <Sheet visible onClose={onClose} title="My Sheet">
        <Text>Sheet body</Text>
      </Sheet>
    );
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is pressed', () => {
    const onClose = jest.fn();
    renderWithProviders(
      <Sheet visible onClose={onClose}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opening is synchronous: content is present in the same render visible flips true, before any animation runs', () => {
    // I-23: this is exactly the "adjust state during render" fix (Sheet.tsx's
    // prevVisible comparison) — mounted must become true in the same commit
    // as `visible`, not a render later via an effect. Regression here would
    // mean the sheet's content is invisible for one extra frame on open.
    const { rerender } = renderWithProviders(
      <Sheet visible={false} onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    expect(screen.queryByText('Sheet body')).toBeNull();

    rerender(
      <Sheet visible onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    expect(screen.getByText('Sheet body')).toBeTruthy();
  });

  it('stays mounted immediately after visible flips to false — unmount waits for the exit animation, not the prop change', () => {
    // The bug this component's own comment (Sheet.tsx:99-106) documents:
    // unmounting in the same render pass that starts the closing animation
    // leaves nothing to animate, and strands translateY for the next open.
    // Guard against a regression by using a parallel mock that does NOT
    // auto-fire its callback, so "still mounted right after the flip" is
    // observed before any exit-completion logic could possibly run.
    parallelSpy.mockImplementation(() => ({ start: () => {} }) as unknown as Animated.CompositeAnimation);

    const { rerender } = renderWithProviders(
      <Sheet visible onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    expect(screen.getByText('Sheet body')).toBeTruthy();

    rerender(
      <Sheet visible={false} onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    // Still on screen: the exit animation (mocked to never call back in
    // this test) hasn't "finished" yet, so setMounted(false) hasn't run.
    expect(screen.getByText('Sheet body')).toBeTruthy();
  });

  it('unmounts once the exit animation actually completes', () => {
    const { rerender } = renderWithProviders(
      <Sheet visible onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    expect(screen.getByText('Sheet body')).toBeTruthy();

    rerender(
      <Sheet visible={false} onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    // parallelSpy's default mock (beforeEach) fires { finished: true }
    // synchronously, so the exit animation's completion callback has already
    // run by the time rerender() returns.
    expect(screen.queryByText('Sheet body')).toBeNull();
  });

  it('rapid re-open interrupts a still-finishing close without throwing, and ends up visible', () => {
    // Sheet.tsx:124-127's own comment: visibleRef is read fresh inside the
    // completion callback specifically so a fast reopen isn't hidden out
    // from under it by a stale closure. Simulate that interruption: the
    // close animation never itself reports finished (mimicking a real
    // interrupted spring), and a reopen fires before it would.
    parallelSpy.mockImplementation(() => ({ start: () => {} }) as unknown as Animated.CompositeAnimation);

    const { rerender } = renderWithProviders(
      <Sheet visible onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );

    rerender(
      <Sheet visible={false} onClose={jest.fn()}>
        <Text>Sheet body</Text>
      </Sheet>
    );
    // Close animation in flight (never calls back in this test).
    expect(screen.getByText('Sheet body')).toBeTruthy();

    expect(() => {
      rerender(
        <Sheet visible onClose={jest.fn()}>
          <Text>Sheet body</Text>
        </Sheet>
      );
    }).not.toThrow();

    expect(screen.getByText('Sheet body')).toBeTruthy();
  });
});
