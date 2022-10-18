const apiKeyAuth = () => (req, res, next) => {
    if (process.env?.API_KEY && req.headers?.['x-api-key'] === process.env.API_KEY) {
        return next();
    }

    return res.status(404).send();
};

export default apiKeyAuth;
