import { invariantResponse } from '@epic-web/invariant'
import { Img } from 'openimg/react'
import { Link, NavLink, Outlet } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { cn, getUserImgSrc } from '#app/utils/misc.tsx'
import { useOptionalUser } from '#app/utils/user.ts'
import { type Route } from './+types/_layout.ts'
import {
	loadNoteSidebar,
	type NoteSidebar,
} from './sidebar.server.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	const result = await loadNoteSidebar(prisma, {
		username: params.username,
		url: new URL(request.url),
	})
	invariantResponse(result.ok, result.ok ? 'Owner not found' : result.message, {
		status: result.ok ? 404 : result.status,
	})

	return { sidebar: result.sidebar }
}

export default function NotesRoute({ loaderData }: Route.ComponentProps) {
	const user = useOptionalUser()
	const owner = loaderData.sidebar.owner
	const isOwner = user?.id === owner.id
	const ownerDisplayName = owner.name ?? owner.username
	const navLinkDefaultClassName =
		'line-clamp-2 block rounded-l-full py-2 pl-8 pr-6 text-base lg:text-xl'
	return (
		<main className="container flex min-h-[400px] flex-1 px-0 pb-12 md:px-8">
			<div className="bg-muted grid w-full grid-cols-4 pl-2 md:container md:rounded-3xl md:pr-0">
				<div className="relative col-span-1">
					<div className="absolute inset-0 flex flex-col">
						<Link
							to={`/users/${owner.username}`}
							className="bg-muted flex flex-col items-center justify-center gap-2 pt-12 pr-4 pb-4 pl-8 xl:flex-row xl:justify-start xl:gap-4"
						>
							<Img
								src={getUserImgSrc(owner.image?.objectKey)}
								alt={ownerDisplayName}
								className="size-16 rounded-full object-cover xl:size-24"
								width={256}
								height={256}
							/>
							<h1 className="text-center text-base font-bold md:text-lg lg:text-left lg:text-2xl">
								{ownerDisplayName}'s Notes
							</h1>
						</Link>
						<ul className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-12">
							{isOwner ? (
								<li className="p-1 pr-0">
									<NavLink
										to="new"
										className={({ isActive }) =>
											cn(navLinkDefaultClassName, isActive && 'bg-accent')
										}
									>
										<Icon name="plus">New Note</Icon>
									</NavLink>
								</li>
							) : null}
							{loaderData.sidebar.links.map((note) => (
								<li key={note.id} className="p-1 pr-0">
									<NavLink
										to={note.id}
										preventScrollReset
										prefetch="intent"
										className={({ isActive }) =>
											cn(navLinkDefaultClassName, isActive && 'bg-accent')
										}
									>
										{note.title}
									</NavLink>
								</li>
							))}
						</ul>
						<SidebarPagerNav sidebar={loaderData.sidebar} />
					</div>
				</div>
				<div className="bg-accent relative col-span-3 md:rounded-r-3xl">
					<Outlet />
				</div>
			</div>
		</main>
	)
}

function SidebarPagerNav({ sidebar }: { sidebar: NoteSidebar }) {
	switch (sidebar.kind) {
		case 'all':
			return null
		case 'page':
			return (
				<nav className="flex shrink-0 gap-4 px-8 py-3 text-base lg:text-xl">
					{sidebar.pager.newerTo ? (
						<Link to={sidebar.pager.newerTo} preventScrollReset>
							Newer
						</Link>
					) : null}
					{sidebar.pager.olderTo ? (
						<Link to={sidebar.pager.olderTo} preventScrollReset>
							Older
						</Link>
					) : null}
				</nav>
			)
		default: {
			const unreachable: never = sidebar
			return unreachable
		}
	}
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<p>No user with the username "{params.username}" exists</p>
				),
			}}
		/>
	)
}
