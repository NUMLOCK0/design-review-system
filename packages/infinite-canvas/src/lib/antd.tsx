import { Modal as AntdModal } from "antd";
import type { ModalProps } from "antd";

import { getWorkspacePortalRoot } from "@infinite-canvas/lib/workspace-portal";

export * from "antd";

function WorkspaceModal(props: ModalProps) {
    return <AntdModal {...props} getContainer={props.getContainer ?? getWorkspacePortalRoot} />;
}

export const Modal = Object.assign(WorkspaceModal, AntdModal) as typeof AntdModal;
