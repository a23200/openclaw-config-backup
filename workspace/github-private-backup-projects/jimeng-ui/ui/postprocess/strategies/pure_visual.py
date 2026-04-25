from __future__ import annotations

import shutil

from ..base import PostprocessArtifacts, PostprocessContext, PostprocessResult, PostprocessStrategy


class PureVisualStrategy(PostprocessStrategy):
    mode = 'visual_only'

    def run(self, context: PostprocessContext) -> PostprocessResult:
        context.update_status('final_packaging')
        mastered_path = context.folder / 'final_mastered.mp4'
        shutil.copy2(context.final_path, mastered_path)
        return PostprocessResult(
            mode=self.mode,
            final_video=mastered_path,
            artifacts=PostprocessArtifacts(final_video=mastered_path),
        )
