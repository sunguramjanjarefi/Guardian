context("Policies", { tags: '@policies' },() => {
    const authorization = Cypress.env("authorization");

    before(() => {
        cy.request({
            method: "POST",
            url: `${Cypress.env("api_server")}policies/import/message`,
            body: { messageId: "1650282926.728623821" },
            headers: {
                authorization,
            },
            timeout: 180000,
        }).then((response) => {
            expect(response.status).to.eq(201);
        });
    });

    it("check returns of the blocks", () => {
        cy.request({
            method: "GET",
            url: Cypress.env("api_server") + "policies",
            headers: {
                authorization,
            },
        }).then((response) => {
            let policyId = response.body.at(-1).id;

            const url = {
                method: "GET",
                url:
                    Cypress.env("api_server") +
                    "policies/" +
                    policyId +
                    "/export/file",
                encoding: null,
                headers: {
                    authorization,
                },
            };
            cy.request(url).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.not.be.oneOf([null, ""]);
                let policy = Cypress.Blob.arrayBufferToBinaryString(
                    response.body
                );
                cy.writeFile(
                    "cypress/fixtures/exportedPolicy.policy",
                    policy,
                    "binary"
                );
            });
        });
    });
});
