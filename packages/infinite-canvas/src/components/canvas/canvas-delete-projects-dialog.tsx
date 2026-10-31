import { useState } from "react";
import { Button, Modal } from "@infinite-canvas/lib/antd";
import { useTranslation } from "react-i18next";

import { App } from "@infinite-canvas/lib/antd";
import { useAssetStore } from "@infinite-canvas/stores/use-asset-store";
import { useCanvasUiStore } from "@infinite-canvas/stores/canvas/use-canvas-ui-store";
import { deleteWorkspaceCanvasProjects } from "@infinite-canvas/services/api/workspace-persistence";

export function CanvasDeleteProjectsDialog() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [deleting, setDeleting] = useState(false);
    const ids = useCanvasUiStore((state) => state.deleteProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const removeSelectedIds = useCanvasUiStore((state) => state.removeSelectedProjectIds);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const confirm = async () => {
        if (deleting || !ids.length) return;
        setDeleting(true);
        try {
            await deleteWorkspaceCanvasProjects(ids);
            cleanupImages();
            removeSelectedIds(ids);
            setDeleteIds([]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.project.deleteFailed"));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Modal
            title={t("canvas.project.deleteTitle")}
            open={ids.length > 0}
            centered
            onCancel={() => !deleting && setDeleteIds([])}
            footer={
                <>
                    <Button disabled={deleting} onClick={() => setDeleteIds([])}>{t("common.cancel")}</Button>
                    <Button danger type="primary" loading={deleting} onClick={() => void confirm()}>
                        {t("common.delete")}
                    </Button>
                </>
            }
        >
            <p className="text-sm text-stone-500">{t("canvas.project.deleteDescription", { count: ids.length })}</p>
        </Modal>
    );
}
