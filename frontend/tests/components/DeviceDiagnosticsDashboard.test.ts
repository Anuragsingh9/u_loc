import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DeviceDiagnosticsDashboard from '@/components/DeviceDiagnosticsDashboard.vue';

describe('DeviceDiagnosticsDashboard.vue', () => {
  const defaultProps = {
    connectionStatus: 'connected',
    isWatching: true,
    currentPosition: {
      lat: 37.7749,
      lng: -122.4194,
      accuracy: 15,
      timestamp: Date.now(),
    },
    geoError: null,
    accuracyText: '±15m (good)',
    lastUpdateText: '12:00:00 PM',
  };

  it('renders system diagnostics dashboard sections', () => {
    const wrapper = mount(DeviceDiagnosticsDashboard, {
      props: defaultProps,
      global: {
        stubs: {
          LocationMap: {
            template: '<div class="mock-location-map"><div class="map-container"></div></div>',
          },
          StatusIndicator: {
            props: ['status', 'label'],
            template: '<span class="mock-status-indicator">{{ label }}</span>',
          },
        },
      },
    });

    // Check System Overview Header
    expect(wrapper.text()).toContain('Device Care & Diagnostics');
    expect(wrapper.text()).toContain('Optimize');

    // Check RAM Performance
    expect(wrapper.text()).toContain('Memory (RAM) Performance');

    // Check Storage Analysis
    expect(wrapper.text()).toContain('Storage Analysis');

    // Check Battery Information
    expect(wrapper.text()).toContain('Battery Information');

    // Check Device Specifications
    expect(wrapper.text()).toContain('Device Specifications');

    // Check Location Service card and Stop Sharing button
    expect(wrapper.text()).toContain('Real-Time Location Service');
    const stopButton = wrapper.find('.stop-btn');
    expect(stopButton.exists()).toBe(true);
    expect(stopButton.text()).toContain('Stop Sharing');
  });

  it('emits stop event when Stop Sharing button is clicked', async () => {
    const wrapper = mount(DeviceDiagnosticsDashboard, {
      props: defaultProps,
      global: {
        stubs: {
          LocationMap: true,
          StatusIndicator: true,
        },
      },
    });

    const stopButton = wrapper.find('.stop-btn');
    await stopButton.trigger('click');

    expect(wrapper.emitted('stop')).toHaveLength(1);
  });
});
