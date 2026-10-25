import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ConsentDialog from '@/components/ConsentDialog.vue';

describe('ConsentDialog.vue', () => {
  it('renders dialog content when visible is true', () => {
    const wrapper = mount(ConsentDialog, {
      props: { visible: true },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.find('.consent-dialog').exists()).toBe(true);
    expect(wrapper.text()).toContain('Location Sharing Consent');
    expect(wrapper.text()).toContain('Your current location will be shared in real-time');
    expect(wrapper.text()).toContain('not stored permanently');
    expect(wrapper.text()).toContain('stop sharing at any time');
  });

  it('does not render dialog content when visible is false', () => {
    const wrapper = mount(ConsentDialog, {
      props: { visible: false },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.find('.consent-dialog').exists()).toBe(false);
  });

  it('emits agree event when "I Agree" button is clicked', async () => {
    const wrapper = mount(ConsentDialog, {
      props: { visible: true },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const agreeBtn = wrapper.find('.btn-success');
    expect(agreeBtn.exists()).toBe(true);
    await agreeBtn.trigger('click');

    expect(wrapper.emitted('agree')).toBeTruthy();
    expect(wrapper.emitted('agree')?.length).toBe(1);
  });

  it('emits cancel event when "Cancel" button is clicked', async () => {
    const wrapper = mount(ConsentDialog, {
      props: { visible: true },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const cancelBtn = wrapper.find('.btn-outline');
    expect(cancelBtn.exists()).toBe(true);
    await cancelBtn.trigger('click');

    expect(wrapper.emitted('cancel')).toBeTruthy();
    expect(wrapper.emitted('cancel')?.length).toBe(1);
  });
});
