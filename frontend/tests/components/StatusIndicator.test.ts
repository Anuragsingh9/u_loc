import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusIndicator from '@/components/StatusIndicator.vue';

describe('StatusIndicator.vue', () => {
  it('renders status dot and accessibility role', () => {
    const wrapper = mount(StatusIndicator, {
      props: { status: 'connected' },
    });

    expect(wrapper.find('.status-indicator').exists()).toBe(true);
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.find('.status-dot').exists()).toBe(true);
  });

  it('renders label when provided', () => {
    const wrapper = mount(StatusIndicator, {
      props: { status: 'sharing', label: 'Sharing Active' },
    });

    expect(wrapper.find('.status-label').exists()).toBe(true);
    expect(wrapper.find('.status-label').text()).toBe('Sharing Active');
    expect(wrapper.attributes('aria-label')).toBe('Status: Sharing Active');
  });

  it('sets pulse class for active states', () => {
    const wrapperSharing = mount(StatusIndicator, {
      props: { status: 'sharing' },
    });
    expect(wrapperSharing.find('.status-dot--pulse').exists()).toBe(true);

    const wrapperStopped = mount(StatusIndicator, {
      props: { status: 'stopped' },
    });
    expect(wrapperStopped.find('.status-dot--pulse').exists()).toBe(false);
  });

  it('computes correct colors for different statuses', () => {
    const statuses = [
      { status: 'connected', expected: 'var(--color-success)' },
      { status: 'sharing', expected: 'var(--color-success)' },
      { status: 'connecting', expected: 'var(--color-warning)' },
      { status: 'disconnected', expected: 'var(--color-danger)' },
      { status: 'error', expected: 'var(--color-danger)' },
      { status: 'idle', expected: 'var(--color-text-tertiary)' },
    ];

    for (const item of statuses) {
      const wrapper = mount(StatusIndicator, {
        props: { status: item.status },
      });
      const dot = wrapper.find('.status-dot');
      expect(dot.attributes('style')).toContain(item.expected);
    }
  });
});
