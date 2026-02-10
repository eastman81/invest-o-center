/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmModal from './ConfirmModal.vue'

/** Stub Teleport so modal content renders in-place (no jsdom). */
const teleportStub = {
  template: '<div class="teleport-stub"><slot /></div>',
}

describe('ConfirmModal', () => {
  it('renders title and message when open', () => {
    const wrapper = mount(ConfirmModal, {
      props: {
        open: true,
        title: 'Delete item?',
        message: 'This cannot be undone.',
      },
      global: { stubs: { Teleport: teleportStub } },
    })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('Delete item?')
    expect(dialog.text()).toContain('This cannot be undone.')
  })

  it('emits close when Cancel is clicked', async () => {
    const wrapper = mount(ConfirmModal, {
      props: { open: true, title: 'Confirm', message: 'Message' },
      global: { stubs: { Teleport: teleportStub } },
    })
    const cancelBtn = wrapper.findAll('button')[0]
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits confirm when confirm button is clicked', async () => {
    const wrapper = mount(ConfirmModal, {
      props: { open: true, title: 'Confirm', message: 'Message' },
      global: { stubs: { Teleport: teleportStub } },
    })
    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('uses confirmLabel when provided', () => {
    const wrapper = mount(ConfirmModal, {
      props: {
        open: true,
        title: 'Confirm',
        message: 'Message',
        confirmLabel: 'Yes, remove',
      },
      global: { stubs: { Teleport: teleportStub } },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons[buttons.length - 1].text()).toBe('Yes, remove')
  })
})
