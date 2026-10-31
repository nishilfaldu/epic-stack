import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { requireNoteUpdate } from '#app/utils/note-access.server.ts'
import { NoteEditor } from './+shared/note-editor.tsx'
import { type Route } from './+types/$noteId_.edit.ts'

export { action } from './+shared/note-editor.server.tsx'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserId(request)
	const note = await requireNoteUpdate(request, {
		ownerUsername: params.username,
		noteId: params.noteId,
	})
	return { note }
}

export default function NoteEdit({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	return <NoteEditor note={loaderData.note} actionData={actionData} />
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => <p>You are not allowed to do that</p>,
				404: ({ params }) => (
					<p>No note with the id "{params.noteId}" exists</p>
				),
			}}
		/>
	)
}
