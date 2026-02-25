interface Props {
  name: string
}

export function Greeting({ name }: Props) {
  return <p>Hello, {name}!</p>
}
