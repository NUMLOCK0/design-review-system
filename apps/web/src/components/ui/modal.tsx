"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type DialogProps = React.ComponentProps<typeof Dialog>

type ModalProps = DialogProps & {
  /** Close when the overlay is clicked. Matches Element UI's default. */
  closeOnClickModal?: boolean
  /** Close when Escape is pressed. Matches Element UI's default. */
  closeOnPressEscape?: boolean
  /** Show the close icon in ModalContent. */
  showClose?: boolean
  /** Run validation or confirmation before closing. Call done() to close. */
  beforeClose?: (done: () => void) => void
}

type ModalContextValue = {
  closeOnClickModal: boolean
  closeOnPressEscape: boolean
  showClose: boolean
}

const ModalContext = React.createContext<ModalContextValue>({
  closeOnClickModal: true,
  closeOnPressEscape: true,
  showClose: true,
})

function flattenModalChildren(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment) {
      return flattenModalChildren(child.props.children)
    }
    return [child]
  })
}

/**
 * Element UI style Dialog behavior on top of Radix: overlay and Escape close by
 * default, a close guard can defer closing, and the body scrolls independently.
 */
function Modal({
  open,
  defaultOpen,
  onOpenChange,
  closeOnClickModal = true,
  closeOnPressEscape = true,
  showClose = true,
  beforeClose,
  ...props
}: ModalProps) {
  const isControlled = open !== undefined
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const visible = isControlled ? open : internalOpen

  const commitOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setInternalOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange]
  )

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        commitOpen(true)
        return
      }

      if (!beforeClose) {
        commitOpen(false)
        return
      }

      let completed = false
      beforeClose(() => {
        if (completed) return
        completed = true
        commitOpen(false)
      })
    },
    [beforeClose, commitOpen]
  )

  const contextValue = React.useMemo(
    () => ({ closeOnClickModal, closeOnPressEscape, showClose }),
    [closeOnClickModal, closeOnPressEscape, showClose]
  )

  return (
    <ModalContext.Provider value={contextValue}>
      <Dialog
        {...props}
        open={visible}
        onOpenChange={handleOpenChange}
        modal
      />
    </ModalContext.Provider>
  )
}

function ModalContent({
  className,
  children,
  showCloseButton,
  onEscapeKeyDown,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const { closeOnClickModal, closeOnPressEscape, showClose } =
    React.useContext(ModalContext)
  const content = flattenModalChildren(children)
  const headerIndex = content.findIndex(
    (child) => React.isValidElement(child) && child.type === ModalHeader
  )
  const header = headerIndex >= 0 ? content[headerIndex] : null
  const body = content.filter((_, index) => index !== headerIndex)
  const bodyContent =
    body.length === 1 && React.isValidElement(body[0]) && body[0].type === ModalBody ? (
      body[0]
    ) : (
      <div
        data-slot="modal-body"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {body}
      </div>
    )

  return (
    <DialogContent
      {...props}
      onEscapeKeyDown={(event) => {
        onEscapeKeyDown?.(event)
        if (!closeOnPressEscape) event.preventDefault()
      }}
      onInteractOutside={(event) => {
        onInteractOutside?.(event)
        if (!closeOnClickModal) event.preventDefault()
      }}
      showCloseButton={showCloseButton ?? showClose}
      className={cn(
        "flex max-h-[90dvh] flex-col gap-0 overflow-hidden",
        className,
        "!overflow-hidden"
      )}
    >
      {header}
      {bodyContent}
    </DialogContent>
  )
}

function ModalHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn("relative z-10 shrink-0 bg-inherit", className)}
      {...props}
    />
  )
}

function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  )
}

function ModalFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn(
        "sticky bottom-0 z-10 shrink-0 border-t border-slate-100 bg-background pt-3",
        className
      )}
      {...props}
    />
  )
}

export {
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
}

export const ModalClose = DialogClose
export const ModalDescription = DialogDescription
export const ModalTitle = DialogTitle
export const ModalTrigger = DialogTrigger
