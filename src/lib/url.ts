export const url = (path: string) => {
    const base_path = `${import.meta.env.BASE_URL}/${path.replace(/^\//, '')}`
    return base_path
}
