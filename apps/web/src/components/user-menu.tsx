import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'
import { Link, useNavigate } from '@tanstack/react-router'

import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'

export default function UserMenu() {
	const navigate = useNavigate()
	const { data: session, isPending } = authClient.useSession()

	if (isPending) {
		return <Skeleton className="h-9 w-24" />
	}

	if (!session) {
		return (
			<Button variant="outline" asChild>
				<Link to="/auth/sign-in">Sign In</Link>
			</Button>
		)
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline">{session.user.name}</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuLabel>My Account</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem>{session.user.email}</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Button
						className="w-full"
						onClick={() => {
							navigate({
								to: '/settings/account',
							})
						}}
					>
						Settings
					</Button>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Button
						variant="destructive"
						className="w-full"
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: () => {
										navigate({
											to: '/auth/sign-in',
										})
									},
								},
							})
						}}
					>
						Sign Out
					</Button>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
